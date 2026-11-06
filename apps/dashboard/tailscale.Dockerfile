# The tailscale sidecar with the dashboard's serve config baked in. Build from the repo root.
# A bind mount of serve.json fails on Coolify: the file is not on the host, so Docker mounts an empty directory.
FROM tailscale/tailscale:v1.104.2
COPY apps/dashboard/serve.json /config/serve.json
