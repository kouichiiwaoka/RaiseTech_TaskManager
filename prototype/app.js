'use strict';
(() => {
  const STORAGE_KEY = 'raisetech-taskboard-prototype-v1';
  const statuses = {todo: '未着手', doing: '作業中', done: '完了'};
  const priorities = {high: '高', medium: '中', low: '低'};
  const $ = selector => document.querySelector(selector);
  const board = $('#board'), dialog = $('#task-dialog'), content = $('#dialog-content');
  let state, mode, selectedId, opener, dragId = null, failNextSave = false, loadBlocked = false;
  const localDate = offset => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const sample = () => ({confirmDelete: true, tasks: [
    {id:'sample-1',title:'トップ画面のレイアウトを考える',description:'ボードの余白やカードの情報量を確認する。\n操作しやすい配置を考えてみよう。',priority:'high',dueDate:localDate(1),status:'todo'},
    {id:'sample-2',title:'参考になるアプリを調べる',description:'使いやすいと感じたポイントをメモする。',priority:'medium',dueDate:'',status:'todo'},
    {id:'sample-3',title:'長いタスク名がカードにどのように表示されるか、折り返しと読みやすさを確認する',description:'長いタイトルの表示確認用サンプルです。',priority:'low',dueDate:localDate(5),status:'todo'},
    {id:'sample-4',title:'画面プロトタイプを作る',description:'追加・詳細・編集・削除の流れを、実際に操作して確認する。',priority:'high',dueDate:localDate(0),status:'doing'},
    {id:'sample-5',title:'タスクの項目を整理する',description:'タイトル、説明文、優先度、期限、ステータスを整理する。',priority:'medium',dueDate:localDate(-1),status:'doing'},
    {id:'sample-6',title:'アプリの目的を決める',description:'個人のタスクを、一つのボードで分かりやすく管理する。',priority:'low',dueDate:localDate(-2),status:'done'}
  ]});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge = priority => `<span class="priority ${priority}">優先度：${priorities[priority]}</span>`;
  const dateLabel = date => date ? `${date.replaceAll('-',' / ')}` : '期限なし';
  function notice(message, retry = false) {
    const el = $('#notice'); el.replaceChildren(); el.hidden = !message;
    if (!message) return;
    el.append(document.createTextNode(message));
    if (retry) { const b = document.createElement('button'); b.textContent='再取得'; b.onclick=load; el.append(b); }
  }
  function error(message) {
    const el = $('#form-error');
    if (dialog.open && el) { el.textContent=message; el.focus(); }
    else notice(message);
  }
  function valid(data) {
    const ids = new Set();
    return data && typeof data.confirmDelete==='boolean' && Array.isArray(data.tasks) && data.tasks.every(t => {
      if (!t || typeof t.id!=='string' || ids.has(t.id)) return false;
      ids.add(t.id);
      return typeof t.title==='string' && t.title.trim() && typeof t.description==='string' && Object.hasOwn(priorities,t.priority) && Object.hasOwn(statuses,t.status) && typeof t.dueDate==='string' && (!t.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate));
    });
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const next = raw === null ? sample() : JSON.parse(raw);
      if (!valid(next)) throw new Error('invalid');
      state=next; loadBlocked=false; notice(''); render();
      $('#save-status').textContent=raw===null?'サンプルを表示中 · 操作後に保存':'このブラウザに保存済み';
    } catch {
      state={tasks:[],confirmDelete:true}; loadBlocked=true; render();
      $('#save-status').textContent='データを取得できませんでした';
      notice('保存済みデータを取得できませんでした。再取得するか、デモメニューからサンプルに戻してください。',true);
    }
  }
  function save(next, message, allowRecovery = false) {
    if (loadBlocked && !allowRecovery) { error('先に保存データを再取得するか、サンプルに戻してください。'); return false; }
    try {
      if (failNextSave) { failNextSave=false; $('#demo-status').textContent='保存失敗のデモを実行しました。もう一度操作すると保存できます。'; throw new Error('demo'); }
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    } catch { error('保存できませんでした。変更は確定していません。入力を保ったまま、もう一度お試しください。'); return false; }
    state=next; loadBlocked=false; notice(''); render(); $('#save-status').textContent=message; return true;
  }
  function render() {
    board.innerHTML=Object.entries(statuses).map(([key,label]) => {
      const tasks=state.tasks.filter(t=>t.status===key);
      return `<section class="column" data-status="${key}" aria-labelledby="heading-${key}"><div class="column-header"><span class="dot" aria-hidden="true"></span><h2 id="heading-${key}">${label}</h2><span class="count">${tasks.length}</span><span class="column-note">${{todo:'これから取り組む',doing:'いま進めている',done:'できたこと'}[key]}</span></div><div class="card-list" data-status="${key}" aria-label="${label}のタスク">${tasks.map(t=>`<button class="card" draggable="true" data-id="${escape(t.id)}" aria-label="${escape(t.title)}の詳細"><span class="card-top">${badge(t.priority)}<span class="grip" aria-hidden="true">⠿</span></span><h3>${escape(t.title)}</h3><span class="card-bottom ${t.dueDate && t.dueDate<localDate(0) && key!=='done'?'overdue':''}">${t.dueDate?'◷':'—'} ${dateLabel(t.dueDate)}</span></button>`).join('') || '<p class="empty"><span aria-hidden="true">▧</span>まだタスクはありません<br>ここにカードを移動できます</p>'}</div></section>`;
    }).join('');
    const done=state.tasks.filter(t=>t.status==='done').length;
    $('#summary').textContent=`${state.tasks.length}件のタスク · ${done}件完了`;
    $('#add-task').disabled=loadBlocked;
  }
  function open(view, id, remember = true) {
    if (remember) opener=document.activeElement;
    mode=view; selectedId=id;
    const t=state.tasks.find(t=>t.id===id);
    const titles={add:'タスクを追加',detail:'タスクの詳細',edit:'タスクを編集',delete:'タスクを削除しますか？'};
    $('#dialog-title').textContent=titles[view];
    $('#dialog-kicker').textContent={add:'NEW TASK',detail:'TASK DETAILS',edit:'EDIT TASK',delete:'DELETE TASK'}[view];
    const err='<p id="form-error" class="form-error" role="alert" tabindex="-1"></p>';
    if (view==='add' || view==='edit') {
      const data=t || {title:'',description:'',priority:'medium',dueDate:''};
      content.innerHTML=`<form id="task-form" novalidate>${err}<label class="field" for="title">タイトル<span class="required">必須</span><input id="title" name="title" placeholder="例：画面のデザインを確認する" required aria-describedby="form-error" value="${escape(data.title)}"></label><label class="field" for="description">説明文<span class="optional">任意</span><textarea id="description" name="description" placeholder="詳しい内容やメモを入力">${escape(data.description)}</textarea></label><div class="field-row"><label class="field" for="priority">優先度<select id="priority" name="priority">${Object.entries(priorities).map(([v,label])=>`<option value="${v}" ${data.priority===v?'selected':''}>${label}</option>`).join('')}</select></label><label class="field" for="due-date">期限<span class="optional">任意</span><input type="date" id="due-date" name="dueDate" value="${escape(data.dueDate)}"></label></div><div class="modal-actions"><button type="button" data-action="cancel">キャンセル</button><button type="submit" class="primary">${view==='add'?'タスクを追加':'変更を保存'}</button></div></form>`;
      $('#task-form').onsubmit=submit;
    } else if (view==='detail' && t) {
      content.innerHTML=`${err}<h3 class="task-title">${escape(t.title)}</h3><dl class="detail-meta"><div><dt>ステータス</dt><dd>${statuses[t.status]}</dd></div><div><dt>優先度</dt><dd>${badge(t.priority)}</dd></div><div><dt>期限</dt><dd>${dateLabel(t.dueDate)}</dd></div></dl><p class="description-label">説明文</p><p class="description">${t.description?escape(t.description):'説明文はありません。'}</p><div class="modal-actions"><button class="danger-text push-left" data-action="delete">削除</button><button data-action="close">閉じる</button><button class="primary" data-action="edit">編集する</button></div>`;
    } else if (view==='delete' && t) {
      content.innerHTML=`${err}<p>以下のタスクを削除します。</p><p class="delete-target">${escape(t.title)}</p><p class="delete-note">削除したタスクは元に戻せません。</p><label class="check-row"><input type="checkbox" id="skip-confirm">今後この確認を表示しない</label><div class="modal-actions"><button data-action="cancel">キャンセル</button><button class="danger" data-action="confirm-delete">削除する</button></div>`;
    }
    if (!dialog.open) dialog.showModal();
    const focusTarget=view==='add'||view==='edit'?$('#title'):view==='delete'?$('[data-action="cancel"]'):$('#close-dialog');
    focusTarget?.focus();
  }
  function close() {
    dialog.close();
    const target=opener?.dataset?.id ? board.querySelector(`[data-id="${CSS.escape(opener.dataset.id)}"]`) : opener;
    (target?.isConnected?target:$('#add-task')).focus();
  }
  function cancel() { if (mode==='edit'||mode==='delete') open('detail',selectedId,false); else close(); }
  function submit(e) {
    e.preventDefault();
    const form=e.currentTarget, title=form.elements.title.value.trim();
    if (!title) { $('#form-error').textContent='タイトルを入力してください。空白のみでは登録できません。'; $('#title').setAttribute('aria-invalid','true'); $('#title').focus(); return; }
    if (!form.checkValidity()) { $('#form-error').textContent='入力した期限を確認してください。'; form.reportValidity(); return; }
    const data={title,description:form.elements.description.value,priority:form.elements.priority.value,dueDate:form.elements.dueDate.value};
    const next=structuredClone(state), adding=mode==='add';
    if (adding) next.tasks.push({...data,id:crypto.randomUUID ? crypto.randomUUID():`task-${Date.now()}-${Math.random().toString(36).slice(2)}`,status:'todo'});
    else Object.assign(next.tasks.find(t=>t.id===selectedId),data);
    if (save(next,adding?'タスクを追加しました · 保存済み':'変更を保存しました')) {
      if (adding) close(); else open('detail',selectedId,false);
    }
  }
  function removeTask(skip) {
    const next=structuredClone(state); next.tasks=next.tasks.filter(t=>t.id!==selectedId);
    if (skip) next.confirmDelete=false;
    if (save(next,'タスクを削除しました · 保存済み')) close();
  }
  $('#add-task').onclick=()=>open('add');
  $('#close-dialog').onclick=cancel;
  dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
  content.onclick=e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    if (action==='cancel') cancel();
    if (action==='close') close();
    if (action==='edit') open('edit',selectedId,false);
    if (action==='delete') { if(state.confirmDelete) open('delete',selectedId,false); else removeTask(false); }
    if (action==='confirm-delete') removeTask($('#skip-confirm').checked);
  };
  board.onclick=e=>{const card=e.target.closest('.card');if(card && !dragId) open('detail',card.dataset.id);};
  function clearDragStyles(){board.querySelectorAll('.drag-over,.drop-before,.drop-after').forEach(el=>el.classList.remove('drag-over','drop-before','drop-after'));}
  board.addEventListener('dragstart',e=>{
    const card=e.target.closest('.card');if(!card || loadBlocked) {e.preventDefault();return;}
    dragId=card.dataset.id; e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');
  });
  board.addEventListener('dragover',e=>{
    const list=e.target.closest('.card-list');if(!list || !dragId)return;
    e.preventDefault();e.dataTransfer.dropEffect='move';clearDragStyles();list.classList.add('drag-over');
    const card=e.target.closest('.card');
    if(card && card.dataset.id!==dragId) card.classList.add(e.clientY<card.getBoundingClientRect().top+card.offsetHeight/2?'drop-before':'drop-after');
  });
  board.addEventListener('dragleave',e=>{if(!board.contains(e.relatedTarget))clearDragStyles();});
  board.addEventListener('drop',e=>{
    const list=e.target.closest('.card-list');if(!list || !dragId)return;
    e.preventDefault();const id=dragId, target=e.target.closest('.card');
    if(target?.dataset.id===id){dragId=null;clearDragStyles();return;}
    const next=structuredClone(state), task=next.tasks.find(t=>t.id===id);
    if(!task)return;
    next.tasks=next.tasks.filter(t=>t.id!==id);task.status=list.dataset.status;
    let index=next.tasks.length;
    if(target){index=next.tasks.findIndex(t=>t.id===target.dataset.id);if(e.clientY>=target.getBoundingClientRect().top+target.offsetHeight/2)index++;}
    else {const last=next.tasks.findLastIndex(t=>t.status===task.status);if(last>=0)index=last+1;}
    next.tasks.splice(index,0,task);dragId=null;clearDragStyles();save(next,'進捗・並び順を保存しました');
  });
  board.addEventListener('dragend',()=>{dragId=null;clearDragStyles();board.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));});
  $('#reset-demo').onclick=()=>{if(confirm('このデモの保存内容をサンプルデータに置き換えますか？')){if(save(sample(),'サンプルデータを保存しました',true))$('#demo-status').textContent='サンプルと削除確認設定を初期状態に戻しました。';}};
  $('#empty-demo').onclick=()=>{if(confirm('このデモのタスクを空にしますか？'))save({tasks:[],confirmDelete:true},'空のボードを保存しました',true);};
  $('#fail-save').onclick=()=>{failNextSave=true;$('#demo-status').textContent='次の追加・編集・削除・移動などで保存失敗を再現します。データは変更しません。';};
  $('#fail-load').onclick=()=>{loadBlocked=true;state={tasks:[],confirmDelete:true};render();notice('データを取得できませんでした（デモ）。「再取得」で保存済みの状態に戻れます。',true);$('#save-status').textContent='取得失敗のデモ';};
  $('#enable-confirm').onclick=()=>{const next=structuredClone(state);next.confirmDelete=true;if(save(next,'削除確認を有効にしました'))$('#demo-status').textContent='次の削除から確認画面を表示します。';};
  window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){if(dialog.open){notice('別のタブでデモの保存内容が変わりました。入力中の内容は維持しています。再取得前に操作をキャンセルしてください。');}else load();}});
  load();
})();
