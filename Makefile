.PHONY: build test deploy docker audit run-shopify clean

build:
	cd compiler && bash build.sh

test: build
	./target/release/atajc test --tier all

deploy: build
	./target/release/atajc deploy --multi-cloud aws,gcp

docker:
	docker build -t ataj:3.0 .

audit: build
	./target/release/atajc audit --export audit-report.pdf

run-shopify: build
	./target/release/atajc run examples/shopify.ataj

clean:
	rm -rf target/
