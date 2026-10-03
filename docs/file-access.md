# Current file access

mekadsh can read current files from a separate HTTP file server. The frontend
remains static and meka's API is unchanged. Recorded operations remain available
without a file server.

## Automatic configuration

Serve `mekadsh-config.json` beside `index.html`, with `Content-Type:
application/json` and `Cache-Control: no-store`:

```json
{
  "version": 1,
  "connections": [
    {
      "apiBaseUrl": "/api/",
      "files": {
        "auth": "basic",
        "mounts": [
          { "pathPrefix": "/", "urlPrefix": "/files/root/" }
        ]
      }
    }
  ]
}
```

The welcome screen suggests the first API URL. File defaults apply only to a
connection with that exact normalized API base URL, including the path and port.
Switching to another daemon does not reuse those defaults. The JSON is public:
never put passwords or API tokens in it.

URLs resolve relative to the configuration file. `pathPrefix` is an absolute
POSIX directory **as seen by meka**. `urlPrefix` is the HTTP directory serving
its contents. The longest matching directory prefix wins. For example,
`/home/alice/report.pdf` maps to `/files/root/home/alice/report.pdf` above.
For an export of just `/workspace/`, set `pathPrefix` to `/workspace/` and map
the corresponding server directory to the configured URL. The web server's
host directory can differ from meka's container path.

Missing configuration (404, or an HTML SPA fallback) leaves file access
unconfigured. Malformed JSON or unsupported configuration is reported under
Settings → File access. Configuration is loaded once per page load; reload after
changing it. Nothing is written to meka or automatically connected without its
API token.

## Manual settings and credentials

In **Settings → File access**, choose the connection and select **Customize**.
Add one or more filesystem/URL mappings and select authentication:

- **Browser session:** send browser credentials, including cookies, to the file
  server. Sign into your gateway first. This is the default when `auth` is omitted.
- **Separate username and password** (`basic`): enter credentials in this section.
- **Separate bearer token** (`bearer`): enter a dedicated file-server token.
- **No credentials** (`none`): suitable only when access is controlled elsewhere.

Mappings persist in this browser. Separate credentials are saved in session
storage for this tab, bound to the connection identity, current meka credential
revision, and exact file configuration. Changing the destination requires entering
file credentials again. Meka's API token is never forwarded to the file server.
Storage failures are reported and changes then last only for the current page.

**Use deployment defaults** removes the manual override. **Disable** overrides
deployment defaults with no mounts. **Test file access** sends a HEAD request
to an existing absolute path; directory listing is not required.

Prefer a same-origin `/files/` route. Cross-origin servers must allow the frontend
origin through CORS, handle preflight for explicit Authorization headers, and allow
credentials when using browser sessions. Expose `Last-Modified` if you want it
displayed. An HTTPS frontend requires HTTPS file URLs. File requests reject
redirects: configure the final URL, not a redirect to another host or login page.

## Using files

Open the conversation's **Files** panel and select **Current file**. A recorded
file supplies the initial path, or enter a path directly for files created by shell
commands. Relative paths use the session's *current* working directory; an old
operation may have used a different directory. Absolute paths avoid this ambiguity.

Current previews support UTF-8 source text, PNG/JPEG/GIF/WebP, PDF where the browser
supports sandboxed PDF viewing, and static HTML with scripts and external resources
disabled. SVG is shown as source. Other binary files can be downloaded.

Preview fetches are limited to 8 MiB; text rendering shows at most 200,000
characters. Downloads are limited to 64 MiB because browser-authenticated fetches
are buffered before saving. Limits are enforced while streaming, even if the
server omits Content-Length. Refresh explicitly retrieves current bytes. There
is no directory browser, file watcher, or automatic reconstruction of old files.

## NixOS deployment in kurisu

The `kurisu.os.mekadsh` module generates the JSON and nginx routes together:

```nix
kurisu.os.mekadsh.webUi.files = {
  enable = true;
  basicAuthFile = "/run/secrets/mekadsh-files.htpasswd";
  # Default: export / at /files/root/.
  mounts.root = { pathPrefix = "/"; root = "/"; };
};
```

Supply an htpasswd file at runtime, readable by the meka service account. For
example, `htpasswd -cB /secure/path/mekadsh-files.htpasswd alice` prompts for a
password; provision or bind-mount that file at `basicAuthFile`. Keep the option a
quoted string, not a Nix path literal, to avoid copying credentials to the store.
Then enter that username and password in Settings → File access.

The dedicated file service uses meka's configured Unix user, group, and
supplementary groups. The default configuration intentionally lets authenticated
users read every regular file that account can read, following symlinks. In the
current container this account is root. A separately customized meka mount namespace
or filesystem sandbox must also be applied to the file service if needed.

The private service binds to loopback (port 8081 by default) and enforces Basic
authentication itself. The public nginx `/files/` route forwards to it. Files are
served as attachments with `nosniff`, a sandbox CSP, and no-store caching. Directory
listing and write methods are disabled. Terminate HTTPS at the gateway before
exposing the route to the LAN. File access is disabled by default; adding this
module support does not enable it or change a running deployment.

## Other deployments

Any static HTTP file server can implement the same mapping. For nginx, an example
location inside a server that already has HTTPS configured is:

```nginx
location ^~ /files/root/ {
    alias /;
    auth_basic "Mekadsh files";
    auth_basic_user_file /run/secrets/mekadsh-files.htpasswd;
    autoindex off;
    if ($uri ~ /$) { return 404; }
    limit_except GET { deny all; }
    types { }
    default_type application/octet-stream;
    add_header Content-Disposition "attachment" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "sandbox; default-src 'none'" always;
    add_header Cache-Control "no-store" always;
}
```

Use a dedicated instance under the intended Unix identity if the main nginx
workers lack file permissions. This configuration intentionally allows symlinks
and full filesystem reads. Prefix mappings in the frontend do not enforce server
authorization. Every route to the file server must enforce the chosen access policy.
Missing files should return 404, not the frontend's `index.html` fallback.
