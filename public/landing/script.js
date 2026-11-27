(() => {
  // Default target for the finished ExamGuard Next.js platform.
  // Override at runtime with ?app=https://your-examguard-url.example
  const DEFAULT_PRODUCT_URL = "/login";

  const params = new URLSearchParams(window.location.search);
  const customAppUrl = params.get("app");

  let targetUrl = DEFAULT_PRODUCT_URL;
  if (customAppUrl) {
    try {
      const parsed = new URL(customAppUrl, window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        targetUrl = parsed.toString();
      }
    } catch {
      targetUrl = DEFAULT_PRODUCT_URL;
    }
  }

  const productLinks = document.querySelectorAll("[data-product-link]");
  productLinks.forEach((link) => {
    link.setAttribute("href", targetUrl);
  });
})();
