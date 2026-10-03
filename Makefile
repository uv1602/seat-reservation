.PHONY: help build dev test docker-build docker-up docker-down docker-logs

help:
	@echo "Seat Reservation System - Available commands:"
	@echo "  make build         - Build TypeScript to JavaScript"
	@echo "  make dev           - Run in development mode with ts-node"
	@echo "  make test          - Run burst test"
	@echo "  make docker-build  - Build Docker image"
	@echo "  make docker-up     - Start Docker containers"
	@echo "  make docker-down   - Stop Docker containers"
	@echo "  make docker-logs   - View Docker logs"
	@echo "  make clean         - Clean build artifacts"

install:
	npm install

build:
	npm run build

dev:
	npm run dev

test: build
	npm run test

docker-build: build
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f app

docker-clean:
	docker-compose down -v
	docker rmi seat-reservation-app:latest

clean:
	rm -rf dist node_modules

reset: clean install build docker-clean docker-up
	@echo "System reset complete"
