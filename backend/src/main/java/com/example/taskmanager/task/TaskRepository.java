package com.example.taskmanager.task;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, UUID> {
    @Query("""
            select t from Task t
            where (:status is null or t.status = :status)
              and locate(lower(:query), lower(t.title)) > 0
            order by case t.status when 'todo' then 0 when 'doing' then 1 else 2 end,
                     t.sortOrder, t.id
            """)
    List<Task> search(@Param("status") String status, @Param("query") String query);
}
