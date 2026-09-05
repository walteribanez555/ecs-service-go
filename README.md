# ecs-service-go

A Go REST API deployed on **AWS ECS Fargate**, with infrastructure defined as code using **AWS CDK (TypeScript)** and a full CI/CD pipeline via **GitHub Actions**.

---

## Project Structure

```
ecs-go/
├── apps/api/          # Go application
├── infra/             # CDK infrastructure (TypeScript)
├── .github/workflows/ # CI/CD pipeline
├── Dockerfile         # Multi-stage build
└── docker-compose.yml # Local development
```

---

## API (`apps/api/`)

- **Language:** Go 1.26, standard library only (`net/http`)
- **Dependency:** `godotenv` for loading environment variables
- **Internal layout:**
  - `cmd/server/main.go` — entry point, starts the HTTP server
  - `internal/config/config.go` — loads env vars with sane defaults (port, PostgreSQL connection)
  - `internal/handlers/health.go` — single endpoint: `GET /health` returns `{"status":"ok"}`
- **Key environment variables:** `PORT`, `ENV`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

---

## Infrastructure (`infra/`)

CDK stack targeting **us-east-1**, with support for two environments: `dev` and `prod`.

| Resource | Dev | Prod |
|---|---|---|
| VPC (2 AZs, 1 NAT Gateway) | ✓ | ✓ |
| ECR Repository | destroyed on delete | retained |
| ECS Fargate | 256 CPU / 512 MB | 512 CPU / 1024 MB |
| ALB (public, port 80) | ✓ | ✓ |
| Auto Scaling | 1–3 tasks | 1–10 tasks |
| CloudWatch Alarms | CPU >80%, unhealthy hosts | same |
| SNS Alert Topic | ✓ | ✓ |

The ALB health check targets `GET /health`.

---

## CI/CD (`.github/workflows/cicd.yml`)

Triggered on push to `main`, `v*` tags, or manually via workflow dispatch. Seven jobs run in sequence:

```
changes → build-pr (PRs only)
        → build-api → deploy-infra → deploy-api → post-deploy-health → tag-release
```

| Job | What it does |
|---|---|
| `changes` | Detects which paths changed (`apps/api/`, `infra/`) and resolves the target environment |
| `build-pr` | On PRs: compiles and runs tests — no image push |
| `build-api` | Builds the Docker image and pushes it to ECR tagged with the short commit SHA |
| `deploy-infra` | Runs `cdk deploy` only when `infra/` changes |
| `deploy-api` | Forces a new ECS deployment and waits for service stability |
| `post-deploy-health` | Hits `http://<ALB>/health` up to 5 times to confirm the deploy is live |
| `tag-release` | Prod only: auto-creates a `vX.Y.0` tag after a successful deployment |

AWS credentials are handled via OIDC using `secrets.AWS_ROLE_ARN` — no long-lived access keys.

---

## Local Development

```bash
# Run with Docker Compose
cd apps/api
docker compose up

# Run directly
go run ./cmd/server/main.go
```

The server starts on port `8080` by default.

---

## Deploy manual (orden correcto)

El Fargate service necesita la imagen en ECR antes de arrancar. El orden es:

```bash
# 1. Infraestructura base (VPC + ECR + Cluster)
cd infra
npm run deploy:dev -- --exclusively EcsGoBase-dev

# 2. Build y push de la imagen Go a ECR
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker build -f Dockerfile --target api --platform linux/amd64 \
  -t <account>.dkr.ecr.us-east-1.amazonaws.com/ecs-go-api-dev:dev-latest .

docker push <account>.dkr.ecr.us-east-1.amazonaws.com/ecs-go-api-dev:dev-latest

# 3. Servicio Fargate (ya con imagen disponible)
npm run deploy:dev -- --exclusively EcsGoService-dev

# 4. Verificar
curl http://<ALB-DNS>/health
# → {"status":"ok"}
```

Para destruir todo:
```bash
cd infra
npx cdk destroy EcsGoService-dev EcsGoBase-dev --context environment=dev --force
```

---

## Deploy automático (CI/CD)

**Dev** — merge to `main`:
```bash
git push origin main
```

**Prod** — trigger manually from GitHub Actions choosing `prod`, or push a version tag:
```bash
git tag v1.0.0 && git push origin v1.0.0
```
