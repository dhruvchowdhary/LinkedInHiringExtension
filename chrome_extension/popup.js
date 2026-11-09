document.addEventListener("DOMContentLoaded", () => {
  // Load previous selections from storage
  chrome.storage.local.get(
    ["toggle1st", "toggle2nd", "toggle3rd", "hiringResults", "searchTerm"],
    (data) => {
      if (data.toggle1st)
        document.getElementById("toggle-1st").classList.add("active");
      if (data.toggle2nd)
        document.getElementById("toggle-2nd").classList.add("active");
      if (data.toggle3rd)
        document.getElementById("toggle-3rd").classList.add("active");

      const searchTerm = data.searchTerm || "hiring";

      // Display previous results if available
      if (data.hiringResults && data.hiringResults.length > 0) {
        const statusText =
          searchTerm === "hiring"
            ? `Previously found ${data.hiringResults.length} connections hiring!`
            : `Previously found ${data.hiringResults.length} connections at ${searchTerm}!`;

        displayResults(data.hiringResults);
        updateStatus(statusText);
      }
      displayWarning();
    }
  );

  // Results currently shown in the popup, kept for Copy / Download CSV.
  let currentResults = [];

  // Event listeners for the results footer
  document.getElementById("copy-results").addEventListener("click", copyResults);
  document
    .getElementById("download-results")
    .addEventListener("click", downloadResults);
  document.getElementById("clear-results").addEventListener("click", clearResults);
  document.getElementById("toggle-2nd").addEventListener("click", toggleButton);
  document.getElementById("toggle-3rd").addEventListener("click", toggleButton);

  document.getElementById("check-hiring").addEventListener("click", () => {
    // Check if the current tab is on LinkedIn
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const url = activeTab.url;
      if (url.includes("linkedin.com")) {
        startHiringCheck();
      } else {
        // If not on LinkedIn, navigate to LinkedIn
        chrome.tabs.update(
          activeTab.id,
          { url: "https://www.linkedin.com" },
          () => {
            updateStatus("Navigating to LinkedIn...");
            setTimeout(() => {
              startHiringCheck(); // Start the hiring check after navigating
            }, 3000); // Delay to ensure the page loads
          }
        );
      }
    });
  });

  document.getElementById("stop-hiring").addEventListener("click", () => {
    chrome.storage.local.set({ stopScript: true }, () => {
      updateStatus("Stopping... Please wait.");
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateResults") {
      displayResults(message.results);
    } else if (message.action === "updateStatus") {
      updateStatus(message.status);

      // Hide the stop button and show the check hiring button when processing is complete or stopped
      if (
        message.status.includes("Complete") ||
        message.status.includes("Stopped")
      ) {
        document.getElementById("stop-hiring").style.display = "none";
        document.getElementById("check-hiring").style.display = "block";
      }
    }
  });

  function toggleButton(event) {
    const button = event.currentTarget;
    button.classList.toggle("active");
    saveToggles();
  }

  function saveToggles() {
    const toggle1st = document
      .getElementById("toggle-1st")
      .classList.contains("active");
    const toggle2nd = document
      .getElementById("toggle-2nd")
      .classList.contains("active");
    const toggle3rd = document
      .getElementById("toggle-3rd")
      .classList.contains("active");

    // Save the selections to storage
    chrome.storage.local.set(
      {
        toggle1st: toggle1st,
        toggle2nd: toggle2nd,
        toggle3rd: toggle3rd,
      },
      () => {
        displayWarning();
      }
    );
  }

  function displayWarning() {
    const toggle3rd = document
      .getElementById("toggle-3rd")
      .classList.contains("active");
    if (toggle3rd) {
      document.getElementById("warning-3rd").style.display = "block";
    } else {
      document.getElementById("warning-3rd").style.display = "none";
    }
  }

  function displayResults(results) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";
    currentResults = results && results.length > 0 ? results : [];

    const footer = document.getElementById("results-footer");
    const count = document.getElementById("results-count");
    if (currentResults.length > 0) {
      count.textContent =
        currentResults.length === 1
          ? "1 connection"
          : `${currentResults.length} connections`;
      footer.style.display = "block";
    } else {
      footer.style.display = "none";
    }

    if (results && results.length > 0) {
      results.forEach((result) => {
        // Build the row with textContent, never innerHTML: names and
        // headlines come from LinkedIn page text, and a headline containing
        // HTML (e.g. `<img src=x onerror=...>`) used to be injected straight
        // into the popup as markup.
        const resultDiv = document.createElement("div");
        resultDiv.className = "result";

        const link = document.createElement("a");
        link.href = result.profileLink;
        link.target = "_blank";

        const strong = document.createElement("strong");
        strong.textContent = `${result.name} (${result.connectionLevel})`;
        link.appendChild(strong);

        resultDiv.appendChild(link);
        resultDiv.appendChild(document.createTextNode(`: ${result.headline}`));
        resultsDiv.appendChild(resultDiv);
      });
    } else {
      resultsDiv.innerHTML = "No results found.";
    }
  }

  function resultsToText(results) {
    return results
      .map(
        (r) => `${r.name} (${r.connectionLevel}) — ${r.headline} — ${r.profileLink}`
      )
      .join("\n");
  }

  function csvField(value) {
    const text = String(value == null ? "" : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function resultsToCsv(results) {
    const header = ["Name", "Connection", "Headline", "Profile"].join(",");
    const rows = results.map((r) =>
      [r.name, r.connectionLevel, r.headline, r.profileLink]
        .map(csvField)
        .join(",")
    );
    return [header, ...rows].join("\n") + "\n";
  }

  function copyResults() {
    if (currentResults.length === 0) return;
    const text = resultsToText(currentResults);
    const done = () => updateStatus("Copied to clipboard.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => copyViaTextarea(text, done));
    } else {
      copyViaTextarea(text, done);
    }
  }

  function copyViaTextarea(text, done) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    done();
  }

  function downloadResults() {
    if (currentResults.length === 0) return;
    const blob = new Blob([resultsToCsv(currentResults)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "linkedin-hiring-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearResults() {
    chrome.storage.local.remove(["hiringResults"], () => {
      displayResults([]);
      updateStatus("Cleared.");
    });
  }

  function updateStatus(status) {
    const statusDiv = document.getElementById("status");
    if (status.toLowerCase() === "idle") {
      statusDiv.classList.remove("visible");
    } else {
      statusDiv.textContent = status;
      statusDiv.classList.add("visible");
    }
  }

  function startHiringCheck() {
    // Hide the "Check Hiring" button and show the "Stop" button when processing starts
    document.getElementById("check-hiring").style.display = "none";
    document.getElementById("stop-hiring").style.display = "block";
    // Clear the previous run's results from the popup immediately; the
    // stored copy is removed below. Otherwise the old list sits there
    // while the new scan runs.
    displayResults([]);

    // Clear previous results and state from local storage
    chrome.storage.local.remove(
      ["hiringResults", "currentPage", "processingComplete", "stopScript"],
      () => {
        // Get toggle states
        const toggle1st = document
          .getElementById("toggle-1st")
          .classList.contains("active");
        const toggle2nd = document
          .getElementById("toggle-2nd")
          .classList.contains("active");
        const toggle3rd = document
          .getElementById("toggle-3rd")
          .classList.contains("active");

        // Get the company name from the search bar
        const companyName =
          document.getElementById("company-name").value.trim().toLowerCase() ||
          "hiring";

        // Generate the LinkedIn URL based on selections
        let network = [];
        if (toggle1st) network.push('"F"');
        if (toggle2nd) network.push('"S"');
        if (toggle3rd) network.push('"O"');

        const networkParam = `%5B${network.join("%2C")}%5D`;
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
          companyName
        )}&network=${networkParam}&origin=FACETED_SEARCH`;

        // Reset the necessary variables and set the new search URL in storage
        chrome.storage.local.set(
          {
            stopScript: false,
            currentPage: 1,
            processingComplete: false,
            searchUrl: searchUrl,
            searchTerm: companyName, // Store the search term
          },
          () => {
            // Update the status immediately to show processing has started
            updateStatus("Processing...");

            // Navigate to the first search page immediately after setting the search URL
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: (searchUrl) => (window.location.href = searchUrl),
                args: [searchUrl],
              });
            });
          }
        );
      }
    );
  }
});
