(() => {
  function getActiveModel() {
    const models = window.monaco?.editor?.getModels?.() || [];
    if (models.length) {
      return models[0];
    }
    return null;
  }

  function getEditorSnapshot() {
    const model = getActiveModel();
    if (!model) {
      return { code: "", language: "" };
    }
    return {
      code: model.getValue?.() || "",
      language: model.getLanguageId?.() || ""
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "LC_COACH_REQUEST_CODE") return;
    const snapshot = getEditorSnapshot();
    window.postMessage({ type: "LC_COACH_CODE", ...snapshot }, "*");
  });
})();
