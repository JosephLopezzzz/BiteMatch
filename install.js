"use strict";

{
  const installButton = document.querySelector("#install-app");
  const guide = document.querySelector("#install-guide");
  const instructions = document.querySelector("#install-instructions");
  const standalone = matchMedia("(display-mode: standalone)");
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const isMacSafari = /Macintosh/.test(navigator.userAgent) && navigator.vendor === "Apple Computer, Inc.";
  const appleInstructions = isAppleMobile
    ? "In Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add."
    : isMacSafari ? "In Safari, open the File menu and choose Add to Dock." : "";
  let installPrompt;

  function updateInstallButton() {
    installButton.hidden = !/^https?:$/.test(location.protocol) ||
      standalone.matches || navigator.standalone === true || !(installPrompt || appleInstructions);
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = undefined;
    installButton.hidden = true;
  });

  standalone.addEventListener("change", updateInstallButton);

  installButton.addEventListener("click", async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = undefined;
      updateInstallButton();
      try {
        await prompt.prompt();
      } catch (error) {
        console.warn("BiteMatch install prompt could not open.", error);
      }
    } else {
      instructions.textContent = appleInstructions;
      guide.showModal();
    }
  });

  updateInstallButton();

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("BiteMatch offline access could not start.", error);
    });
  }
}
