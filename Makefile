SHELL := /bin/bash
.DEFAULT_GOAL := rpms

BUILD_DIR := $(abspath build)
RELEASE ?= f44
DIST ?= .fc44
SPEC := $(BUILD_DIR)/SPECS/gnome-shell.spec
RPM_ARGS = --define '_topdir $(BUILD_DIR)' --define 'dist $(DIST)'

.PHONY: all build rpms prepare launcher-source sources patch-dir help
all build: rpms

prepare:
	mkdir -p "$(BUILD_DIR)"/{BUILD,BUILDROOT,SOURCES,SPECS,artifacts}

launcher-source: prepare
	tar -cJf "$(BUILD_DIR)/SOURCES/launcher-source.tar.xz.tmp" -C launcher-source .
	mv "$(BUILD_DIR)/SOURCES/launcher-source.tar.xz.tmp" "$(BUILD_DIR)/SOURCES/launcher-source.tar.xz"

sources: launcher-source
	@# Reuse downloaded archives, then let fedpkg verify/download the sources.
	@for archive in gnome-shell-*.tar.xz; do \
		[[ ! -f "$$archive" ]] || cp -u "$$archive" "$(BUILD_DIR)/SOURCES/"; \
	done
	fedpkg --name gnome-shell --namespace rpms --release $(RELEASE) sources --outdir "$(BUILD_DIR)/SOURCES"
	cp -- *.patch "$(BUILD_DIR)/SOURCES/"
	rpmautospec process-distgit gnome-shell.spec "$(SPEC)"

rpms: sources
	rpmbuild -ba $(RPM_ARGS) \
		--define '_rpmdir $(BUILD_DIR)/artifacts' \
		--define '_srcrpmdir $(BUILD_DIR)/artifacts' "$(SPEC)"

# Never run prep over an existing workspace: it may contain uncommitted edits.
patch-dir: sources
	@test ! -e "$(BUILD_DIR)/patches" || { echo 'build/patches already exists; move it aside before preparing another patch tree.' >&2; exit 1; }
	mkdir -p "$(BUILD_DIR)/patches"
	rpmbuild -bp $(RPM_ARGS) --define '_builddir $(BUILD_DIR)/patches' "$(SPEC)"
	@echo 'Prepared source tree under build/patches. See README.build.md for patch creation.'

help:
	@echo 'make                Build source and binary RPMs in build/artifacts'
	@echo 'make prepare        Create build directories'
	@echo 'make launcher-source Package launcher sources under build/SOURCES'
	@echo 'make patch-dir      Prepare a separate source tree under build/patches'
