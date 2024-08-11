console.log("LinkedIn Hiring Checker content script is running...");

let currentPage = parseInt(localStorage.getItem("currentPage")) || 1;
let processingComplete = false;

function checkHiring() {
  const results = [];
  const items = document.querySelectorAll(".reusable-search__result-container");

  console.log(`Found ${items.length} items on the page.`);

  items.forEach((item) => {
    const headlineElement = item.querySelector(
      ".entity-result__primary-subtitle"
    );
    const nameElement = item.querySelector(
      '.entity-result__title-text > a span[aria-hidden="true"]'
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

      results.push({ name, headline, profileLink });
      console.log(`Found hiring: ${name}, ${headline}`);
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

      if (processingComplete) {
        updateStatus(`Complete, Found ${newResults.length} people hiring!`);
      } else {
        updatePopup(newResults);
        updateStatus(
          `Processing... Page ${currentPage}, Found ${newResults.length} people hiring!`
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
  const searchUrl =
    "https://www.linkedin.com/search/results/people/?keywords=hiring&network=%5B%22F%22%2C%22S%22%5D&origin=FACETED_SEARCH";
  console.log(`Navigating to search page: ${searchUrl}`);
  window.location.href = searchUrl;
}

function navigateToNextPage() {
  currentPage++;
  localStorage.setItem("currentPage", currentPage);
  const nextPageUrl = `https://www.linkedin.com/search/results/people/?keywords=hiring&network=%5B%22F%22%2C%22S%22%5D&origin=FACETED_SEARCH&page=${currentPage}`;
  console.log(`Navigating to the next page: ${nextPageUrl}`);
  window.location.href = nextPageUrl;
}

function processPage() {
  if (processingComplete) {
    console.log("Processing already completed.");
    updateStatus(`Complete, Found ${newResults.length} people hiring!`);
    return;
  }

  // Check if we are on the correct search page
  if (!window.location.href.includes("linkedin.com/search/results/people/")) {
    navigateToSearchPage();
    return;
  }

  const { results, foundHiring } = checkHiring();
  saveAndDisplayResults(results);

  if (foundHiring) {
    console.log("Hiring found on this page, navigating to the next page...");
    setTimeout(navigateToNextPage, 3000); // wait before navigating to the next page
  } else {
    console.log("No more hiring results found. Process complete.");
    processingComplete = true; // Ensure no further processing happens
    saveAndDisplayResults([]); // Call to save final status and display complete message
    localStorage.removeItem("currentPage");
  }
}

// Start the process by calling processPage
processPage();
