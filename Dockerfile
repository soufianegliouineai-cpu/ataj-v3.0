FROM rust:1.78-slim as builder
WORKDIR /app
COPY compiler/.
RUN chmod +x build.sh &&./build.sh

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/atajc /atajc
COPY examples/ /examples
COPY deploy/ /deploy
WORKDIR /
ENTRYPOINT ["/atajc"]
