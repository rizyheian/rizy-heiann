export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.PE_BYPASS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "PE_BYPASS_API_KEY belum diatur di Vercel"
    });
  }

  const rawUrl = req.body?.url;
  if (typeof rawUrl !== "string" || rawUrl.length > 4096) {
    return res.status(400).json({
      error: "URL tidak valid"
    });
  }

  let target;
  try {
    target = new URL(rawUrl.trim());
    if (!["http:", "https:"].includes(target.protocol) ||
        target.username || target.password) {
      throw new Error("URL tidak valid");
    }
  } catch {
    return res.status(400).json({
      error: "Masukkan URL HTTP atau HTTPS yang valid"
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetch(
      "https://pebypasser.vercel.app/bypass",
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ url: target.href }),
        signal: controller.signal
      }
    );

    const data = await response.json().catch(() => null);

    if (!data || typeof data !== "object") {
      return res.status(502).json({
        error: "Respons API tidak valid"
      });
    }

    if (response.ok &&
        data.status === "success" &&
        typeof data.result === "string") {
      let result;
      try {
        result = new URL(data.result);
        if (!["http:", "https:"].includes(result.protocol)) {
          throw new Error("URL hasil tidak valid");
        }
      } catch {
        return res.status(502).json({
          error: "URL hasil dari API tidak valid"
        });
      }

      return res.status(200).json({
        status: "success",
        result: result.href,
        time: data.time || null
      });
    }

    if (response.ok && data.status === "manual") {
      return res.status(200).json({
        status: "manual",
        error: "Tindakan manual diperlukan"
      });
    }

    return res.status(response.status >= 500 ? 502 : 400).json({
      status: "failed",
      error: typeof data.error === "string"
        ? data.error
        : "API tidak berhasil memproses tautan"
    });
  } catch (error) {
    return res.status(502).json({
      error: error.name === "AbortError"
        ? "Waktu tunggu API habis"
        : "Tidak dapat menghubungi PE Bypass API"
    });
  } finally {
    clearTimeout(timeout);
  }
  }
