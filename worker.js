export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("GitQuick Worker OK", { status: 200 });
    }

    try {
      const body = await req.json();
      const { owner, repo, branch = "main", files, message } = body;

      if (!owner || !repo || !files || !Array.isArray(files)) {
        return new Response("Invalid payload", { status: 400 });
      }

      const GH = "https://api.github.com";
      const headers = {
        "Authorization": `token ${env.GITHUB_TOKEN}`,
        "User-Agent": "gitquick-worker",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      };

      // 1) Obtener HEAD (o detectar repo vacío)
      let baseSha = null;
      let headRes = await fetch(`${GH}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });

      if (headRes.ok) {
        const ref = await headRes.json();
        baseSha = ref.object.sha;
      }

      // 2) Crear TREE (masivo)
      const treePayload = {
        tree: files.map(f => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          content: f.content
        }))
      };

      if (baseSha) treePayload.base_tree = baseSha;

      const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify(treePayload)
      });

      if (!treeRes.ok) {
        const t = await treeRes.text();
        throw new Error("Tree error: " + t);
      }

      const { sha: treeSha } = await treeRes.json();

      // 3) Crear COMMIT
      const commitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: message || "gitquick push",
          tree: treeSha,
          parents: baseSha ? [baseSha] : []
        })
      });

      if (!commitRes.ok) {
        const t = await commitRes.text();
        throw new Error("Commit error: " + t);
      }

      const { sha: commitSha } = await commitRes.json();

      // 4) Actualizar REF (o crearla si no existe)
      if (baseSha) {
        await fetch(`${GH}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ sha: commitSha })
        });
      } else {
        await fetch(`${GH}/repos/${owner}/${repo}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: commitSha
          })
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        commit: commitSha
      }), { status: 200 });

    } catch (err) {
      return new Response(JSON.stringify({
        ok: false,
        error: err.message
      }), { status: 500 });
    }
  }
};
