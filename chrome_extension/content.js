(function () {
  // In-memory flags for this page load only. The page counter lives in
  // chrome.storage.local (see below) — never in window.localStorage, so a
  // run that is interrupted (tab closed, crash, navigation away) cannot
  // leave a stale page number behind for the next run.
  let currentPage = 1;
  let processingComplete = false;
  let stopScript = false;

  function checkHiring(searchTerm) {
    const results = [];
    const items = document.querySelectorAll(
      ".reusable-search__result-container"
    );
    items.forEach((item) => {
      const headlineElement = item.querySelector(
        ".entity-result__primary-subtitle"
      );
      const nameElement = item.querySelector(
        '.entity-result__title-text > a span[aria-hidden="true"]'
      );
      const connectionElement = item.querySelector(
        ".entity-result__badge-text"
      );

      if (
        headlineElement &&
        headlineElement.textContent.toLowerCase().includes(searchTerm)
      ) {
        // Some results (e.g. private "LinkedIn Member" profiles) have no
        // profile link. The old code read `.href` off a null element here,
        // which threw and killed the whole page scan, losing every other
        // result on the page. Skip link-less results instead.
        const linkElement = item.querySelector(
          ".entity-result__title-text > a"
        );
        if (!linkElement) {
          return;
        }
        const profileLink = linkElement.href;
        const name = nameElement ? nameElement.textContent.trim() : "Unknown";
        const headline = headlineElement.textContent.trim();

        // Extract the connection level, remove any leading "•" and space, then take the first three characters
        let connectionLevel = connectionElement
          ? connectionElement.textContent
              .trim()
              .replace("•", "")
              .trim()
              .substring(0, 3)
          : "";

        results.push({ name, headline, profileLink, connectionLevel });
      }
    });

    return { results, foundHiring: results.length > 0 };
  }

  function saveAndDisplayResults(results) {
    chrome.storage.local.get(["hiringResults", "searchTerm"], (data) => {
      const allResults = data.hiringResults || [];
      // LinkedIn search pages can overlap, so the same profile can appear
      // on two pages. Merge by profile link so nobody is listed twice.
      const seen = new Set(allResults.map((r) => r.profileLink));
      for (const result of results) {
        if (!seen.has(result.profileLink)) {
          seen.add(result.profileLink);
          allResults.push(result);
        }
      }
      const newResults = allResults;
      const searchTerm = data.searchTerm || "hiring";

      chrome.storage.local.set({ hiringResults: newResults }, () => {
        if (processingComplete || stopScript) {
          // "Stopped" (not "Complete") when the user hit Stop, so the popup
          // can swap the Stop button back to Search (it already listens for
          // both words; only "Complete" was ever sent before).
          const verb = stopScript ? "Stopped" : "Complete";
          const statusText =
            searchTerm === "hiring"
              ? `${verb}, Found ${newResults.length} connections hiring!`
              : `${verb}, Found ${newResults.length} connections at ${searchTerm}!`;
          updateStatus(statusText);
        } else {
          updatePopup(newResults);
          const statusText =
            searchTerm === "hiring"
              ? `Processing... Found ${newResults.length} connections hiring!`
              : `Processing... Found ${newResults.length} connections at ${searchTerm}!`;
          updateStatus(statusText);
        }
      });
    });
  }

  function updatePopup(results) {
    chrome.runtime.sendMessage({ action: "updateResults", results: results });
  }

  function updateStatus(status) {
    chrome.runtime.sendMessage({ action: "updateStatus", status: status });
  }

  function navigateToSearchPage() {
    chrome.storage.local.get("searchUrl", (data) => {
      let searchUrl = data.searchUrl;
      if (!searchUrl) {
        return;
      }

      // Update the search URL to include the current page number
      if (currentPage > 1) {
        searchUrl += `&page=${currentPage}`;
      }

      window.location.href = searchUrl;
    });
  }

  function navigateToNextPage() {
    currentPage++;
    // Single source of truth: the counter lives in chrome.storage.local,
    // which the popup already clears when a new run starts. Previously it
    // lived in window.localStorage while the popup cleared chrome.storage,
    // so the two stores disagreed and a fresh run silently resumed at the
    // stale page of an interrupted run, skipping pages 1..N-1.
    chrome.storage.local.set({ currentPage }, () => {
      navigateToSearchPage();
    });
  }

  function finishRun() {
    // A finished run leaves no page counter behind, so the next run
    // always starts on page 1.
    chrome.storage.local.remove(["currentPage"]);
  }

  function processPage() {
    chrome.storage.local.get(
      ["stopScript", "searchTerm", "currentPage"],
      (data) => {
        if (data.stopScript) {
          stopScript = true;
          processingComplete = true;
          saveAndDisplayResults([]); // Ensure we save and display final status
          finishRun();
          return;
        }

        if (processingComplete) {
          chrome.storage.local.get("hiringResults", (data) => {
            const allResults = data.hiringResults || [];
            const searchTerm = data.searchTerm || "hiring";
            const statusText =
              searchTerm === "hiring"
                ? `Complete, Found ${allResults.length} connections hiring!`
                : `Complete, Found ${allResults.length} connections at ${searchTerm}!`;
            updateStatus(statusText);
          });
          return;
        }

        currentPage = data.currentPage || 1;

        // Check if we are on the correct search page
        if (
          !window.location.href.includes("linkedin.com/search/results/people/")
        ) {
          navigateToSearchPage();
          return;
        }

        const { results, foundHiring } = checkHiring(
          data.searchTerm || "hiring"
        );
        saveAndDisplayResults(results);

        if (foundHiring) {
          setTimeout(navigateToNextPage, 2000); // wait before navigating to the next page
        } else {
          processingComplete = true; // Ensure no further processing happens
          saveAndDisplayResults([]); // Call to save final status and display complete message
          finishRun();
        }
      }
    );
  }

  // Start the process by calling processPage
  processPage();
})();
