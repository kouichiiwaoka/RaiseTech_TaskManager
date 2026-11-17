package com.example.taskmanager.task;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdditionalTaskWriteApiTests {
 @LocalServerPort int port;
 @Autowired JdbcTemplate jdbc;
 final String marker="boundary-"+UUID.randomUUID();
 RestClient client;
 @BeforeEach void setup(){client=RestClient.create("http://127.0.0.1:"+port);}
 @AfterEach void cleanup(){jdbc.update("DELETE FROM tasks WHERE title LIKE ?",marker+"%");}
 TaskResponse write(boolean create,UUID id,Map<String,?> body){
  var request=create?client.post().uri("/api/tasks"):client.put().uri("/api/tasks/"+id);
  return request.contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(TaskResponse.class);
 }
 TaskResponse get(UUID id){return client.get().uri("/api/tasks/"+id).retrieve().body(TaskResponse.class);}
 @Test void exactUnicodeBoundariesForCreateAndUpdate(){
  for(String unit:List.of("日","😀")){
   String title=marker+unit.repeat(255-marker.length());
   var created=write(true,null,Map.of("title",title));
   assertThat(get(created.id()).title()).isEqualTo(title);
   assertThatThrownBy(()->write(true,null,Map.of("title",title+unit))).isInstanceOf(HttpClientErrorException.BadRequest.class);
   String edited=marker+unit.repeat(254-marker.length())+"改";
   var updated=write(false,created.id(),Map.of("title",edited,"priority","low"));
   assertThat(get(created.id())).isEqualTo(updated);
   assertThatThrownBy(()->write(false,created.id(),Map.of("title",edited+unit,"priority","high"))).isInstanceOf(HttpClientErrorException.BadRequest.class);
   assertThat(get(created.id())).isEqualTo(updated);
  }
  assertThat(jdbc.queryForObject("SELECT count(*) FROM tasks WHERE title LIKE ?",Integer.class,marker+"%")).isEqualTo(2);
 }
 @Test void invalidEditFieldsAndMissingTargetPreserveDatabase(){
  var original=write(true,null,Map.of("title",marker));
  for(var body:List.of(Map.of("title",marker,"priority","invalid"),Map.of("title",marker),Map.of("title",marker,"priority","high","dueDate","2026-13-01"))){
   assertThatThrownBy(()->write(false,original.id(),body)).isInstanceOf(HttpClientErrorException.BadRequest.class);
   assertThat(get(original.id())).isEqualTo(original);
  }
  assertThatThrownBy(()->write(false,UUID.randomUUID(),Map.of("title",marker,"priority","high"))).isInstanceOf(HttpClientErrorException.NotFound.class);
  assertThat(get(original.id())).isEqualTo(original);
 }
}
