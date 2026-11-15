package com.example.taskmanager;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TaskManagerApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void healthEndpointReportsUpWithoutDatabase() {
        var response = RestClient.create()
                .get()
                .uri("http://127.0.0.1:" + port + "/actuator/health")
                .retrieve()
                .body(String.class);

        assertThat(response).contains("\"status\":\"UP\"");
    }
}
