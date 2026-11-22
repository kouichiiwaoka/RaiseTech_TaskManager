#!/usr/bin/env python3
"""PreToolUse hook: CLAUDE.md で禁止された Bash 操作を拒否（deny）または確認（ask）にする。

permissions.deny は先頭一致のため、`git -C . reset --hard`、絶対パスの git、
`&&` で連結したコマンド、`sh -c` / `xargs` 経由などをすり抜ける。
このフックはコマンドを分割・正規化してから判定し、その抜け道を補強する。
完全な検出は保証しない（CLAUDE.md の「補助制御」参照）。

- 判定はコマンド内の全セグメントを集計し、deny を ask より優先する。
- 想定外の例外・入力不正は ask（fail-closed 寄り）にする。
- 標準出力: 拒否/確認時のみ hookSpecificOutput JSON。許可時は何も出さない。
"""
import json
import os
import re
import shlex
import subprocess
import sys

SEPARATORS = {";", "&&", "||", "|", "&", "|&", "(", ")", ";;"}
RESERVED = {"then", "do", "else", "elif", "if", "while", "until", "!", "{", "}", "time", "fi", "done"}
WRAPPERS_WITH_VALUE = {
    "sudo": {"-u", "-g", "-C", "-h", "-p"},
    "nice": {"-n"},
    "ionice": {"-c", "-n"},
    "stdbuf": {"-i", "-o", "-e"},
}
WRAPPERS = {"command", "builtin", "exec", "nohup", "caffeinate", "setsid"} | set(WRAPPERS_WITH_VALUE)
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
INTERPRETER = re.compile(r"^(python[0-9.]*|node|perl|ruby|osascript|awk|gawk|php|deno|bun)$")
DB_CLIENTS = {"psql", "mysql", "sqlite3"}
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"}
DANGEROUS_GIT_CONFIG = re.compile(r"^(alias\.|core\.(pager|sshcommand|fsmonitor|hookspath|editor|gitproxy)|.*\.(command|cmd)$)", re.I)
SCRIPT_DELETE = re.compile(
    r"os\.(remove|unlink|rmdir|removedirs)|shutil\.rmtree|\.unlink\(|rmSync|unlinkSync|rmdirSync|"
    r"fs\.rm\b|File\.delete|FileUtils\.rm|\bunlink\b|\.rmdir\(|\bdelete\b.*\bfile\b"
)
SCRIPT_EXEC = re.compile(r"\bsystem\s*\(|\bexec[a-z]*\s*\(|popen|subprocess|child_process|spawn|do shell script|`")
SCRIPT_ENV = re.compile(r"""['"]([^'"]*/)?\.env['"]""")
SQL_DESTRUCTIVE = re.compile(r"\b(drop|truncate)\b|\bdelete\s+from\b", re.I)
ENV_FILE = re.compile(r"(^|/)\.env(\.[^/]*)?$")
ENV_GLOB = re.compile(r"(^|/)\.e[^/]*$")
READERS = {
    "cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "sed", "awk", "strings",
    "xxd", "od", "hexdump", "bat", "source", ".", "cp", "open", "nano", "vi", "vim", "code", "base64",
    "diff", "cmp", "sort", "uniq", "wc", "cut", "tr", "jq", "nl", "tac", "rev", "column", "pbcopy",
    "curl", "scp", "rsync", "zip", "tar", "gzip", "openssl", "env",
}
GLOB_OR_EXPANSION = re.compile(r"[$*?\[{~\\]")


def read_script(path):
    """実在する小さなスクリプトファイルの中身を返す（.env は読まない）。読めなければ None。"""
    try:
        if ENV_FILE.search(path) or not os.path.isfile(path) or os.path.getsize(path) > 1_000_000:
            return None
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception:
        return None


class Checker:
    def __init__(self):
        self.denies = []
        self.asks = []

    def deny(self, reason):
        if reason not in self.denies:
            self.denies.append(reason)

    def ask(self, reason):
        if reason not in self.asks:
            self.asks.append(reason)

    def inspect_file(self, check):
        """スクリプトファイルの中身を別の Checker で検査し、deny だけを反映する（ask は増やさない）。"""
        sub = Checker()
        check(sub)
        for reason in sub.denies:
            self.deny("スクリプトファイル内: " + reason)

    # ---------- 前処理 ----------
    def extract_heredocs(self, command):
        """ヒアドキュメント本文を取り除き、(本文, 引用付きか, 直前のコマンド文字列) を返す。"""
        pattern = re.compile(
            r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1([^\n]*)\n(.*?)(?:\n[ \t]*\2[ \t]*(?=\n|$)|\Z)",
            re.S,
        )
        docs = []

        def repl(m):
            head = command[: m.start()].split("\n")[-1]
            docs.append((m.group(4), bool(m.group(1)), head))
            return "<< " + m.group(2) + m.group(3)

        return pattern.sub(repl, command), docs

    def substitutions(self, command):
        """単一引用の外にある $( ... ) と `...` の中身を返す（入れ子の括弧に対応）。"""
        out, i, n, in_single, in_double = [], 0, len(command), False, False
        while i < n:
            c = command[i]
            if c == "\\" and not in_single:
                i += 2
                continue
            if c == "'" and not in_double:
                in_single = not in_single
            elif c == '"' and not in_single:
                in_double = not in_double
            elif not in_single and command.startswith("$(", i):
                depth, j = 1, i + 2
                while j < n and depth:
                    depth += {"(": 1, ")": -1}.get(command[j], 0)
                    j += 1
                out.append(command[i + 2 : j - 1])
                i = j
                continue
            elif not in_single and c == "`":
                j = command.find("`", i + 1)
                if j == -1:
                    break
                out.append(command[i + 1 : j])
                i = j + 1
                continue
            i += 1
        return out

    def split_segments(self, command):
        lexer = shlex.shlex(command.replace("\n", " ; "), posix=True, punctuation_chars=";&|()<>")
        lexer.whitespace_split = True
        lexer.commenters = ""
        segment = []
        for tok in lexer:
            if tok in SEPARATORS or (set(tok) <= set(";&|()") and tok):
                if segment:
                    yield segment
                segment = []
            else:
                segment.append(tok)
        if segment:
            yield segment

    # ---------- 判定 ----------
    def check_command(self, command, depth=0):
        if depth > 5:
            self.ask("ネストが深いコマンドは確認が必要")
            return
        command, heredocs = self.extract_heredocs(command)
        for body, quoted, head in heredocs:
            self.check_heredoc(body, quoted, head, depth)
        for inner in self.substitutions(command):
            self.check_command(inner, depth + 1)
        try:
            segments = list(self.split_segments(command))
        except ValueError:
            self.ask("コマンドを解析できない（引用符の不一致など）ため確認が必要")
            segments = [s.split() for s in re.split(r"[;&|\n]+", command) if s.strip()]
        for seg in segments:
            self.check_tokens(seg, depth)

    def check_heredoc(self, body, quoted, head, depth):
        try:
            segs = list(self.split_segments(head))
        except ValueError:
            segs = [head.split()]
        tokens = self.strip_wrappers(segs[-1]) if segs else []
        cmd = os.path.basename(tokens[0]) if tokens else ""
        if cmd in SHELLS:
            self.check_command(body, depth + 1)
        elif INTERPRETER.match(cmd):
            self.check_script(body)
        elif cmd in DB_CLIENTS:
            self.check_sql(body)
        elif cmd == "docker":
            self.check_sql(body)
            self.check_command(body, depth + 1) if "sh" in tokens else None
        if not quoted:
            for inner in self.substitutions(body):
                self.check_command(inner, depth + 1)

    def check_script(self, code):
        if SCRIPT_DELETE.search(code):
            self.deny("スクリプト言語でのファイル削除は禁止")
        if SCRIPT_ENV.search(code):
            self.deny("スクリプトから .env を読む操作は禁止")
        if SCRIPT_EXEC.search(code):
            self.ask("スクリプト言語からの外部コマンド実行は確認が必要")

    def check_sql(self, sql):
        if SQL_DESTRUCTIVE.search(sql):
            self.deny("DB の削除・全消去（DROP/TRUNCATE/DELETE FROM）は禁止")

    def strip_wrappers(self, tokens):
        i = 0
        while i < len(tokens):
            t = tokens[i]
            b = os.path.basename(t)
            if t in RESERVED:
                i += 1
            elif re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t):
                if t.startswith("GIT_CONFIG"):
                    self.ask("GIT_CONFIG_* による設定注入は確認が必要")
                i += 1
            elif b == "env":
                i += 1
                while i < len(tokens) and (tokens[i].startswith("-") or "=" in tokens[i]):
                    i += 2 if tokens[i] in {"-u", "-C", "-S"} else 1
            elif b in WRAPPERS:
                values = WRAPPERS_WITH_VALUE.get(b, set())
                i += 1
                while i < len(tokens) and tokens[i].startswith("-"):
                    i += 2 if tokens[i] in values else 1
            elif b == "timeout":
                i += 1
                while i < len(tokens) and tokens[i].startswith("-"):
                    i += 2 if tokens[i] in {"-s", "-k", "--signal", "--kill-after"} else 1
                i += 1
            elif b == "xargs":
                i += 1
                while i < len(tokens) and tokens[i].startswith("-"):
                    i += 2 if tokens[i] in {"-I", "-n", "-P", "-L", "-d", "-E", "-s", "-a"} else 1
            else:
                break
        return tokens[i:]

    def split_redirects(self, tokens):
        args, redirects, i = [], [], 0
        while i < len(tokens):
            t = tokens[i]
            if t and set(t) <= set("<>&") and ("<" in t or ">" in t):
                target = tokens[i + 1] if i + 1 < len(tokens) else ""
                if t.endswith("&") and target.isdigit() or t.startswith("&") is False and t == ">&" and target.isdigit():
                    i += 2
                    continue
                redirects.append((t, target))
                i += 2
                continue
            if re.match(r"^\d+$", t) and i + 1 < len(tokens) and set(tokens[i + 1]) <= set("<>&") and tokens[i + 1]:
                i += 1  # 2>&1 の "2"
                continue
            args.append(t)
            i += 1
        return args, redirects

    def check_tokens(self, tokens, depth=0):
        compound_end = bool(tokens) and tokens[0] in {"}", "done", "fi", "esac"}  # `{ ...; } > f` は中身を書く
        tokens, redirects = self.split_redirects(self.strip_wrappers(tokens))
        tokens = self.strip_wrappers(tokens)
        for op, target in redirects:
            if "<" in op and op != "<<" and op != "<<<" and ENV_FILE.search(target) and not target.endswith(".env.example"):
                self.deny(".env の内容を読む操作は禁止")
        # 中身を書かない上書き（`: > f`、`> f`、`true > f`、`cat /dev/null > f` など）による既存ファイルの内容消去
        empty_writer = (not tokens and not compound_end) or tokens in ([":"], ["true"], ["cat", "/dev/null"], ["printf", ""], ["echo", "-n"])
        if empty_writer:
            for op, target in redirects:
                if op.endswith(">") and not op.endswith(">>") and target and os.path.isfile(target):
                    self.deny("リダイレクトによる既存ファイルの内容消去は禁止")
        if not tokens:
            return
        first = tokens[0]
        cmd = os.path.basename(first)
        args = tokens[1:]
        herestrings = [t for op, t in redirects if op == "<<<"]

        if GLOB_OR_EXPANSION.search(first):
            self.ask("変数・展開・グロブで組み立てたコマンド名は確認が必要")
            return

        if cmd in SHELLS:
            ci = next((k for k, a in enumerate(args) if re.match(r"^-[A-Za-z]*c[A-Za-z]*$", a)), None)
            if ci is not None and ci + 1 < len(args):
                self.check_command(args[ci + 1], depth + 1)
            elif herestrings:
                for h in herestrings:
                    self.check_command(h, depth + 1)
            else:
                scripts = [a for a in args if not a.startswith("-")]
                body = read_script(scripts[0]) if scripts else None
                if body is not None:
                    self.inspect_file(lambda c: c.check_command(body, depth + 1))  # 既存のスクリプトファイルは中身も検査する
                if not (scripts and re.match(r"^(\./)?scripts/[\w.-]+\.sh$", scripts[0])):
                    self.ask("シェルへの標準入力・スクリプト実行は内容を検査できないため確認が必要")
            return
        if cmd == "eval":
            self.check_command(" ".join(args), depth + 1)
            return
        if cmd in {"source", "."} and args and not ENV_FILE.search(args[0]):
            self.ask("source による外部スクリプト実行は確認が必要")
        if cmd == "git":
            self.check_git(args)
        if cmd in {"rm", "rmdir", "unlink", "shred", "srm", "trash", "rimraf"}:
            self.deny(f"{cmd} によるファイル削除は禁止。不要ファイルは削除せず報告する")
        if cmd in {"npx", "pnpm", "yarn", "bunx"} and any(a in {"rimraf", "del-cli", "trash-cli", "kill-port"} for a in args):
            self.deny("パッケージ実行によるファイル削除・プロセス停止は禁止")
        if cmd == "busybox" and args:
            self.check_tokens(args, depth + 1)
        if cmd == "find":
            if "-delete" in args:
                self.deny("find -delete は禁止")
            for flag in ("-exec", "-execdir", "-ok", "-okdir"):
                if flag in args:
                    self.check_tokens(args[args.index(flag) + 1 :], depth + 1)
        if cmd == "rsync" and any(a.startswith("--del") or a.startswith("--remove") for a in args):
            self.deny("rsync による削除は禁止")
        if cmd == "mv" and args and (args[-1] == "/dev/null" or "/.Trash" in args[-1]):
            self.deny("mv による実質的な削除は禁止")
        if cmd == "cp" and args[:1] == ["/dev/null"]:
            self.deny("/dev/null による上書き消去は禁止")
        if cmd == "truncate":
            self.deny("truncate によるファイル内容の消去は禁止")
        if INTERPRETER.match(cmd):
            self.check_script(" ".join(args + herestrings))
            files = [a for a in args if not a.startswith("-")]
            body = read_script(files[0]) if files and "-c" not in args and "-e" not in args else None
            if body is not None:
                self.inspect_file(lambda c: c.check_script(body))  # python3 x.py などはファイルの中身も検査する
        if cmd in {"killall", "pkill"} or (cmd == "fuser" and any("k" in a for a in args if a.startswith("-"))):
            self.deny(f"{cmd} による広範囲・強制的なプロセス停止は禁止")
        if cmd == "kill":
            self.check_kill(args)
        if cmd in {"docker", "podman", "docker-compose"}:
            self.check_docker(cmd, args, depth)
        if cmd in {"dropdb", "dropuser"}:
            self.deny("DB の削除は禁止")
        if cmd in DB_CLIENTS:
            self.check_sql(" ".join(args + herestrings))
            if "-f" in args or "--file" in args:
                self.ask("SQL ファイルの実行は内容を確認してから行う")
        if any(re.search(r"flyway(Clean|:clean)|\bclean\b.*flyway", a, re.I) for a in args):
            self.deny("Flyway clean（DB 全消去）は禁止")
        if cmd in READERS or INTERPRETER.match(cmd):
            for a in args:
                if ENV_FILE.search(a) and not a.endswith(".env.example"):
                    self.deny(".env の内容を読む・表示する操作は禁止")
                elif ENV_GLOB.search(a) and GLOB_OR_EXPANSION.search(a):
                    self.ask(".env に一致しうるグロブは確認が必要")

    def check_kill(self, args):
        for k, a in enumerate(args):
            nxt = args[k + 1] if k + 1 < len(args) else ""
            if re.match(r"^-(9|kill|sigkill|s ?9|s ?kill|n ?9)$", a.replace(" ", ""), re.I):
                self.deny("kill -9 などの強制終了は禁止。確認した PID へ SIGTERM を使う")
            if a in {"-s", "-n", "--signal"} and re.match(r"^(9|kill|sigkill)$", nxt, re.I):
                self.deny("kill -9 などの強制終了は禁止。確認した PID へ SIGTERM を使う")
            if a == "-1" or (a == "--" and nxt.startswith("-")):
                self.deny("全プロセス・プロセスグループへの kill は禁止")

    def check_docker(self, cmd, args, depth):
        words = []
        i = 0
        while i < len(args):
            a = args[i]
            if a.startswith("-"):
                i += 2 if a in {"-f", "--file", "-p", "--project-name", "--env-file", "--context", "-H", "--profile"} else 1
                continue
            words.append((i, a))
            i += 1
        if not words:
            return
        idx, sub = words[0]
        rest = [w for _, w in words[1:]]
        if sub == "compose" or cmd == "docker-compose":
            csub = rest[0] if sub == "compose" and rest else sub
            if csub in {"down", "rm", "kill"}:
                self.deny("コンテナ・ボリュームの削除や強制停止は禁止（docker compose stop / docker stop のみ可）")
            if csub in {"exec", "run"}:
                self.check_container_command(args[idx + 1 :], depth, compose=True)
            return
        if sub in {"rm", "rmi", "kill"} or (
            sub in {"volume", "container", "image", "network", "system", "builder"} and rest[:1] and rest[0] in {"rm", "prune", "remove", "kill"}
        ):
            self.deny("コンテナ・ボリューム・イメージの削除や強制停止は禁止（docker stop のみ可）")
        if sub in {"exec", "run"}:
            self.check_container_command(args[idx + 1 :], depth)

    def check_container_command(self, args, depth, compose=False):
        i = 0
        with_value = {"-e", "--env", "-u", "--user", "-w", "--workdir", "--name", "-v", "--volume", "-p", "--entrypoint", "--env-file"}
        while i < len(args) and args[i].startswith("-"):
            i += 2 if args[i] in with_value else 1
        if compose and args[i:i + 1] and args[i] in {"exec", "run"}:
            i += 1
            while i < len(args) and args[i].startswith("-"):
                i += 2 if args[i] in with_value else 1
        inner = args[i + 1 :]  # コンテナ名/サービス名の後
        if inner:
            self.check_tokens(inner, depth + 1)

    # ---------- git ----------
    @staticmethod
    def has_long(rest, option):
        """git は一意な長オプションの省略を受け付けるため前方一致で比較する。"""
        for a in rest:
            name = a.split("=", 1)[0]
            if name == option or (len(name) >= 4 and name.startswith("--") and option.startswith(name)):
                return True
        return False

    @staticmethod
    def current_branch():
        try:
            return subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, timeout=3).stdout.strip()
        except Exception:
            return ""

    def check_git(self, args):
        i = 0
        while i < len(args) and args[i].startswith("-"):
            opt = args[i].split("=", 1)[0]
            if opt in {"-c", "--config-env"} and i + 1 < len(args):
                key = args[i + 1].split("=", 1)[0]
                if DANGEROUS_GIT_CONFIG.match(key):
                    self.deny("git -c による alias・外部コマンド設定の注入は禁止")
            if opt == "--exec-path" and "=" in args[i]:
                self.deny("git --exec-path の変更は禁止")
            i += 2 if args[i] in GIT_OPTS_WITH_VALUE else 1
        if i >= len(args):
            return
        sub, rest = args[i], args[i + 1 :]
        flags = set(rest)
        short = "".join(a[1:] for a in rest if re.match(r"^-[A-Za-z]+$", a))
        positional = [a for a in rest if not a.startswith("-")]
        L = lambda opt: self.has_long(rest, opt)  # noqa: E731

        if GLOB_OR_EXPANSION.search(sub):
            self.ask("変数で組み立てた git サブコマンドは確認が必要")
        if sub == "config" and any(re.match(r"^alias\.|^core\.(pager|sshcommand|fsmonitor|hookspath|editor)", a, re.I) for a in positional):
            if len(positional) >= 2 or L("--add"):
                self.deny("git alias・外部コマンド設定の追加は禁止")
        if sub == "reset" and (L("--hard") or L("--merge")):
            self.deny("git reset --hard/--merge は未コミット変更を破棄するため禁止")
        if sub == "checkout":
            creating = bool({"-b", "-B", "--orphan"} & flags) or "b" in short or "B" in short
            if L("--force") or "f" in short:
                self.deny("強制 checkout は禁止")
            elif "--" in flags or "." in flags:
                self.deny("git checkout -- <path> / . は作業ツリーを破棄するため禁止")
            elif not creating and ("p" in short or L("--patch") or len(positional) >= 2
                                    or any(os.path.exists(p) for p in positional)):
                self.ask("git checkout <path> は作業ツリーを書き戻す可能性があるため確認が必要")
        if sub == "switch" and (L("--force") or L("--discard-changes") or "f" in short):
            self.deny("強制 switch は禁止")
        if sub == "restore":
            if not ({"-S"} & flags or L("--staged")) or ({"-W"} & flags or L("--worktree")):
                self.deny("作業ツリーを書き戻す git restore は禁止（--staged のみ可）")
        if sub == "clean" and not ({"-n"} & flags or "n" in short or L("--dry-run")):
            self.deny("git clean は禁止（-n による確認のみ可）")
        if sub == "rebase" and not (L("--abort") or L("--quit")):
            self.deny("git rebase（履歴改変）は禁止")
        if sub == "pull" and (L("--rebase") or "r" in short):
            self.deny("git pull --rebase（履歴改変）は禁止")
        if sub in {"pull", "fetch"} and (L("--prune") or L("--prune-tags") or "p" in short or "P" in short):
            self.deny("--prune は復旧情報を除去するため禁止")
        if sub == "remote" and positional[:1] == ["prune"] or (sub == "remote" and positional[:1] == ["update"] and ("p" in short or L("--prune"))):
            self.deny("git remote prune は禁止")
        if sub in {"filter-branch", "filter-repo", "gc", "prune", "repack", "maintenance", "pack-refs", "replace"}:
            self.deny(f"git {sub} は禁止（履歴改変・復旧情報の除去）")
        if sub == "commit" and L("--amend"):
            self.deny("git commit --amend（履歴改変）は禁止")
        if sub == "reflog" and positional[:1] and positional[0] in {"expire", "delete"}:
            self.deny("reflog の削除・期限切れ処理は禁止")
        if sub == "update-ref":
            if "-d" in flags or L("--stdin"):
                self.deny("git update-ref による参照削除は禁止")
            else:
                self.ask("git update-ref による参照の直接変更は確認が必要")
        if sub == "symbolic-ref" and ("-d" in flags or L("--delete")):
            self.deny("git symbolic-ref -d は禁止")
        if sub == "worktree":
            self.deny("git worktree の利用は禁止")
        if sub == "stash" and positional[:1] and positional[0] in {"drop", "clear"}:
            self.deny("git stash drop/clear は禁止")
        if sub == "rm" and not L("--cached"):
            self.deny("git rm によるファイル削除は禁止（--cached のみ可）")
        if sub in {"checkout-index", "read-tree"} and (L("--force") or "f" in short or L("--reset") or "u" in short):
            self.deny(f"git {sub} による作業ツリーの上書きは禁止")
        if sub == "apply" and (L("--reverse") or "R" in short):
            self.ask("git apply -R は作業ツリーを書き戻すため確認が必要")
        if sub == "submodule" and positional[:1] == ["deinit"]:
            self.deny("git submodule deinit は禁止")
        if sub == "branch":
            deleting = L("--delete") or "d" in short or "D" in short
            forced = L("--force") or "f" in short or "D" in short
            if deleting and forced or "M" in short or "C" in short:
                self.deny("ブランチの強制削除・強制付け替えは禁止（git branch -d のみ可）")
            elif forced:
                self.deny("git branch -f（強制付け替え）は禁止")
        if sub == "tag":
            if "-d" in flags or L("--delete"):
                self.ask("タグ削除は確認が必要")
            if "f" in short or L("--force"):
                self.deny("git tag -f（タグの強制付け替え）は禁止")
        if sub == "push":
            self.check_push(rest, flags, short, positional, L)

    def check_push(self, rest, flags, short, positional, L):
        if L("--force") or L("--force-with-lease") or L("--force-if-includes") or L("--mirror") or L("--prune") or L("--all") or "f" in short:
            self.deny("force push / --mirror / --prune / --all は禁止")
        refspecs = positional[1:]
        if any(r.startswith("+") for r in refspecs):
            self.deny("+refspec による強制 push は禁止")
        if any(GLOB_OR_EXPANSION.search(r) for r in positional):
            self.ask("変数を含む push 先は確認が必要")
        mains = {"main", "master", "refs/heads/main", "refs/heads/master"}
        for r in refspecs:
            if r.startswith(":"):
                continue
            src, _, dst = r.partition(":")
            dst = dst or src
            if dst in mains or (dst == "HEAD" and self.current_branch() in mains):
                self.deny("main への直接 push は禁止（作業ブランチを明示して push し PR を経由する）")
        if not refspecs and not L("--tags"):
            if self.current_branch() in mains:
                self.deny("main 上での push は禁止")
            self.ask("push 先ブランチが明示されていません。作業ブランチを明示してください")
        if L("--delete") or "d" in short or any(r.startswith(":") for r in refspecs):
            self.ask("リモートブランチ/タグの削除。マージ済み（merge-base --is-ancestor 確認済み）の作業ブランチか確認が必要")


def emit(decision, reasons):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": "[guard_bash] " + " / ".join(reasons) + "。CLAUDE.md の禁止事項を参照。別表記で再試行しないこと。",
        }
    }, ensure_ascii=False))


def main():
    try:
        payload = json.load(sys.stdin)
        if payload.get("tool_name") != "Bash":
            return 0
        command = (payload.get("tool_input") or {}).get("command")
        if not isinstance(command, str):
            emit("ask", ["コマンドを取得できないため確認が必要"])
            return 0
        checker = Checker()
        checker.check_command(command)
    except Exception as exc:  # 想定外の失敗では素通りさせない
        emit("ask", [f"フックの判定に失敗したため確認が必要（{type(exc).__name__}）"])
        return 0
    if checker.denies:
        emit("deny", checker.denies)
    elif checker.asks:
        emit("ask", checker.asks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
