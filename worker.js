export default {
  async fetch(request, env) {
    // Solo POST
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const contentType = request.headers.get("content-type") || "";

    // Aceptamos multipart/form-data (ZIP desde HTML)
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data with ZIP" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const formData = await request.formData();

      const file = formData.get("zip");
      const owner = formData.get("owner");
      const repo = formData.get("repo");
      const branch = formData.get("branch") || "main";

      if (!file || !owner || !repo) {
        return new Response(
          JSON.stringify({
            error: "Campos requeridos: zip, owner, repo"
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Leemos el ZIP (sin descomprimir aún)
      const zipBuffer = await file.arrayBuffer();
      const zipSize = zipBuffer.byteLength;

      // RESPUESTA DE CONFIRMACIÓN (para que NO se cuelgue)
      return new Response(
        JSON.stringify({
          ok: true,
          message: "ZIP recibido correctamente",
          repo: `${owner}/${repo}`,
          branch,
          zipSize,
          note:
            "El ZIP fue recibido. La fase de descompresión + GitHub push se agrega en el siguiente paso."
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Worker crash",
          detail: String(err)
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
};
