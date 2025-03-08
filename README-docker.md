# Docker

Build a version of a docker image:

```
docker build . -t hochstenbach/mastodon-cli:v0.0.1
```

Run a docker image:

```
docker run --rm --env-file .env -v `pwd`/inbox:/app/inbox -it hochstenbach/mastodon-cli:v0.0.1 
```

Push it to DockerHub:

```
docker push hochstenbach/mastodon-cli:v0.0.1
```
