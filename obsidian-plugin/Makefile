# Makefile for lava plugin

# Configuration
BUILD_CMD = bun run build
OBSIDIAN_PLUGIN_DIR = ~/.config/obsidian/wiki/.obsidian/plugins/lava/

# Default target
.PHONY: all
all: build deploy

# Build the plugin in production mode
.PHONY: build
build:
	@echo "Building lava plugin..."
	$(BUILD_CMD)
	@echo "Build completed!"

# Deploy to Obsidian plugin directory
.PHONY: deploy
deploy:
	@mkdir -p $(OBSIDIAN_PLUGIN_DIR)
	cp main.js $(OBSIDIAN_PLUGIN_DIR)
	cp manifest.json $(OBSIDIAN_PLUGIN_DIR)

# Install (build + deploy)
.PHONY: install
install: build deploy
	@echo "Plugin built and installed successfully!"

# Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	rm -f main.js

# Show help
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  build    - Build the plugin in production mode"
	@echo "  deploy   - Copy built plugin to Obsidian"
	@echo "  install  - Build and deploy the plugin"
	@echo "  clean    - Remove build artifacts"
	@echo "  help     - Show this help message"
	@echo ""
	@echo "Current configuration:"
	@echo "  BUILD_CMD: $(BUILD_CMD)"
	@echo "  OBSIDIAN_PLUGIN_DIR: $(OBSIDIAN_PLUGIN_DIR)"