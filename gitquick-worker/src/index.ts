export default {
  async fetch(request, env) {

    /* ===== CORS ===== */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers
      });
    }

    try {
      const body = await request.json();
      const { owner, repo, branch, message, files } = body;

      if (!owner || !repo || !files?.length) {
        return new Response("Datos incompletos", {
          status: 400,
          headers
        });
      }

      const gh = (url, opts = {}) =>
        fetch(`https://api.github.com${url}`, {
          ...opts,
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(opts.headers || {})
          }
        });

      /* ===== HEAD ===== */
      let baseSha = null;
      const refRes = await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
      if (refRes.ok) {
        const ref = await refRes.json();
        baseSha = ref.object.sha;
      }

      /* ===== BLOBS ===== */
      const tree = [];
      for (const f of files) {
        const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({
            content: f.content,
            encoding: "utf-8"
          })
        }).then(r => r.json());

        tree.push({
          path: f.path.replace(/^\/+/, ""),
          mode: "100644",
          type: "blob",
          sha: blob.sha
        });
      }

      /* ===== TREE ===== */
      const treeRes = await gh(`/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseSha,
          tree
        })
      });
      const newTree = await treeRes.json();

      /* ===== COMMIT ===== */
      const commitRes = await gh(`/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: message || "gitQuick push",
          tree: newTree.sha,
          parents: baseSha ? [baseSha] : []
        })
      });
      const commit = await commitRes.json();

      /* ===== REF ===== */
      if (baseSha) {
        await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha })
        });
      } else {
        await gh(`/repos/${owner}/${repo}/git/refs`, {
          method: "POST",
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: commit.sha
          })
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        commit: commit.sha
      }), { headers });

    } catch (e) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers }
      );
    }
  }
};
