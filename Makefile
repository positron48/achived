.PHONY: up down seed check

APP_PORT ?= 3001
DEV_PID_FILE ?= .goalgraph-dev.pid
DEV_LOG_FILE ?= .goalgraph-dev.log

up:
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@if [ -f "$(DEV_PID_FILE)" ] && kill -0 $$(cat "$(DEV_PID_FILE)") >/dev/null 2>&1; then \
		echo "GoalGraph уже запущен на порту $(APP_PORT)."; \
		echo "Открой приложение: http://localhost:$(APP_PORT)"; \
		exit 0; \
	fi; \
	docker compose up -d db; \
	npx prisma generate >/dev/null; \
	(npx prisma migrate deploy >/dev/null 2>&1 || npx prisma db push --accept-data-loss >/dev/null); \
	nohup npm run dev -- --hostname 0.0.0.0 --port $(APP_PORT) --webpack > "$(DEV_LOG_FILE)" 2>&1 & echo $$! > "$(DEV_PID_FILE)"; \
	echo ""; \
	echo "GoalGraph запущен."; \
	echo "Открой приложение: http://localhost:$(APP_PORT)"; \
	echo "PostgreSQL доступен на: localhost:5432"; \
	echo "Логи приложения: $(DEV_LOG_FILE)"; \
	echo ""

down:
	@if [ -f "$(DEV_PID_FILE)" ]; then \
		PID=$$(cat "$(DEV_PID_FILE)"); \
		if kill -0 $$PID >/dev/null 2>&1; then \
			kill $$PID >/dev/null 2>&1 || true; \
			echo "GoalGraph app остановлен (pid $$PID)."; \
		fi; \
		rm -f "$(DEV_PID_FILE)"; \
	fi
	@docker compose down
	@echo "GoalGraph остановлен."

seed:
	@npm run prisma:seed
	@echo "Seed применён."

check:
	@echo "==> npm run lint"
	@npm run lint
	@echo "==> npm run test:run"
	@npm run test:run
	@echo "==> npm run build"
	@npm run build
	@echo "==> docker build (аналог CI)"
	@docker build --file Dockerfile --tag goalgraph:check .
	@echo ""
	@echo "Все проверки пройдены: локальные и Docker (CI-аналог)."
