
synth:
	mkdir -p artifacts
	cdk synth \
		-e remix \
		> ./artifacts/remix.yml

deploy:
	yarn postinstall
	yarn build
	sh ./deploy.sh
