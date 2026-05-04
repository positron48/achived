.PHONY: up down seed check

APP_PORT ?= 3001
MAX_PORT ?= 3999

up:
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@PORT="$(APP_PORT)"; \
	while lsof -i :$$PORT >/dev/null 2>&1; do \
		PORT=$$((PORT + 1)); \
		if [ $$PORT -gt "$(MAX_PORT)" ]; then \
			echo "Не удалось найти свободный порт в диапазоне $(APP_PORT)-$(MAX_PORT)."; \
			exit 1; \
		fi; \
	done; \
	if [ "$$PORT" != "$(APP_PORT)" ]; then \
		echo "Порт $(APP_PORT) занят, использую $$PORT."; \
	fi; \
	APP_PORT=$$PORT docker compose up -d; \
	echo ""; \
	echo "GoalGraph запущен."; \
	echo "Открой приложение: http://localhost:$$PORT"; \
	echo "PostgreSQL доступен на: localhost:5432"; \
	echo ""

down:
	@docker compose down
	@echo "GoalGraph остановлен."

seed:
	@docker compose exec app npm run prisma:seed
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
