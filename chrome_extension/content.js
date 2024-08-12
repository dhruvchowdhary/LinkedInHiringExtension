(function () {
  console.log("LinkedIn Hiring Checker content script is running...");

  // Reset variables if they are already set
  window.currentPage = parseInt(localStorage.getItem("currentPage")) || 1;
  window.processingComplete = false;
  window.stopScript = false;

  function checkHiring() {
    const results = [];
    const items = document.querySelectorAll(
      ".reusable-search__result-container"
    );

    console.log(`Found ${items.length} items on the page.`);

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
        headlineElement.textContent.toLowerCase().includes("hiring")
      ) {
        const profileLink = item.querySelector(
          ".entity-result__title-text > a"
        ).href;
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
        console.log(`Found hiring: ${name} (${connectionLevel}), ${headline}`);
      }
    });

    return { results, foundHiring: results.length > 0 };
  }

  function saveAndDisplayResults(results) {
    chrome.storage.local.get("hiringResults", (data) => {
      const allResults = data.hiringResults || [];
      const newResults = allResults.concat(results);

      chrome.storage.local.set({ hiringResults: newResults }, () => {
        console.log("Results saved:", newResults);

        if (window.processingComplete || window.stopScript) {
          updateStatus(`Complete, Found ${newResults.length} people hiring!`);
        } else {
          updatePopup(newResults);
          updateStatus(
            `Processing... Page ${window.currentPage}, Found ${newResults.length} people hiring!`
          );
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
        console.error("Search URL is undefined.");
        return;
      }

      // Update the search URL to include the current page number
      if (window.currentPage > 1) {
        searchUrl += `&page=${window.currentPage}`;
      }

      console.log(`Navigating to search page: ${searchUrl}`);
      window.location.href = searchUrl;
    });
  }

  function navigateToNextPage() {
    window.currentPage++;
    localStorage.setItem("currentPage", window.currentPage);
    navigateToSearchPage();
  }

  function processPage() {
    chrome.storage.local.get("stopScript", (data) => {
      if (data.stopScript) {
        window.stopScript = true;
        window.processingComplete = true;
        saveAndDisplayResults([]); // Ensure we save and display final status
        localStorage.removeItem("currentPage");
        return;
      }

      if (window.processingComplete) {
        console.log("Processing already completed.");
        chrome.storage.local.get("hiringResults", (data) => {
          const allResults = data.hiringResults || [];
          updateStatus(`Complete, Found ${allResults.length} people hiring!`);
        });
        return;
      }

      // Check if we are on the correct search page
      if (
        !window.location.href.includes("linkedin.com/search/results/people/")
      ) {
        navigateToSearchPage();
        return;
      }

      const { results, foundHiring } = checkHiring();
      saveAndDisplayResults(results);

      if (foundHiring) {
        console.log(
          "Hiring found on this page, navigating to the next page..."
        );
        setTimeout(navigateToNextPage, 2000); // wait before navigating to the next page
      } else {
        console.log("No more hiring results found. Process complete.");
        window.processingComplete = true; // Ensure no further processing happens
        saveAndDisplayResults([]); // Call to save final status and display complete message
        localStorage.removeItem("currentPage");
      }
    });
  }

  // Start the process by calling processPage
  processPage();
})();
