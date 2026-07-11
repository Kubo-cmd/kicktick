# syntax=docker/dockerfile:1
# KickTick Contracts — Rust 1.96 + Solana 3.1.10 + Anchor 1.0.2
# Build: docker build -t kicktick-contracts .
# Run:  docker run --rm -it -v $(pwd):/workspace -v ~/.config/solana:/home/builder/.config/solana kicktick-contracts bash

FROM ubuntu:24.04

ARG USER_ID=1000
ARG GROUP_ID=1000
ARG USER_NAME=builder

ENV DEBIAN_FRONTEND=noninteractive
ENV RUST_VERSION=1.96.0
ENV SOLANA_VERSION=3.1.10
ENV ANCHOR_VERSION=1.0.0
ENV CARGO_HOME=/usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup
ENV AVM_HOME=/usr/local/anchor
ENV PATH="/usr/local/cargo/bin:/usr/local/solana/active_release/bin:/usr/local/anchor:${PATH}"

# Install system deps
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    libssl-dev \
    pkg-config \
    libudev-dev \
    libsqlite3-dev \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Rust via rustup
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_VERSION}
RUN rustup component add rustfmt clippy

# Install Solana CLI (Agave)
RUN curl -sSfL "https://github.com/anza-xyz/agave/releases/download/v${SOLANA_VERSION}/agave-install-init-x86_64-unknown-linux-gnu" -o agave-install-init \
    && chmod +x agave-install-init \
    && ./agave-install-init -d /usr/local/solana v${SOLANA_VERSION} \
    && rm agave-install-init

# Install Anchor CLI via avm
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install ${ANCHOR_VERSION} && avm use ${ANCHOR_VERSION}

# Verify installations
RUN rustc --version && solana --version && anchor --version

# Pre-download SBF platform-tools (LLVM + rustc) into SDK
# install.sh creates ~/.cache/solana/<ver>/platform-tools/ + symlinks in dependencies/
# Keep symlinks — cargo-build-sbf expects them and updates them on first build
RUN cd /usr/local/solana/active_release/bin/platform-tools-sdk/sbf && \
    bash scripts/install.sh

RUN if getent passwd ${USER_ID} > /dev/null; then \
      EXISTING_USER=$(getent passwd ${USER_ID} | cut -d: -f1); \
      usermod -l ${USER_NAME} -d /home/${USER_NAME} -m $EXISTING_USER; \
    else \
      groupadd -g ${GROUP_ID} ${USER_NAME} 2>/dev/null || true; \
      useradd -m -u ${USER_ID} -g ${GROUP_ID} -s /bin/bash ${USER_NAME}; \
    fi \
    && if [ -d /root/.cache/solana ]; then \
      mkdir -p /home/${USER_NAME}/.cache/solana && \
      cp -r /root/.cache/solana/* /home/${USER_NAME}/.cache/solana/ && \
      chown -R ${USER_NAME}:${GROUP_ID} /home/${USER_NAME}/.cache; \
    fi \
    && mkdir -p /workspace \
    && chown -R ${USER_NAME}:${GROUP_ID} /workspace \
    && chown -R ${USER_NAME}:${GROUP_ID} ${CARGO_HOME} \
    && chown -R ${USER_NAME}:${GROUP_ID} ${RUSTUP_HOME} \
    && chown -R ${USER_NAME}:${GROUP_ID} ${AVM_HOME} \
    && chown -R ${USER_NAME}:${GROUP_ID} /usr/local/solana

USER ${USER_NAME}

WORKDIR /workspace

# Default: keep container alive for dev
CMD ["bash"]