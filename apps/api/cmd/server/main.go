package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/ecs-go/api/internal/config"
	"github.com/ecs-go/api/internal/handlers"
)

func main() {
	cfg := config.Load()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handlers.Health)

	log.Printf("ENV:          %s", cfg.Env)
	log.Printf("DB_HOST:      %s", cfg.DBHost)
	log.Printf("DB_PORT:      %s", cfg.DBPort)
	log.Printf("DB_USER:      %s", cfg.DBUser)
	log.Printf("DB_NAME:      %s", cfg.DBName)
	log.Printf("DATABASE_URL: %s", cfg.DatabaseURL)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("server listening on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
