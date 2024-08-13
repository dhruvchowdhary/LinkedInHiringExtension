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

  // Event listeners for toggles
  document.getElementById("toggle-1st").addEventListener("click", toggleButton);
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

    if (results && results.length > 0) {
      results.forEach((result) => {
        const resultDiv = document.createElement("div");
        resultDiv.innerHTML = `<a href="${result.profileLink}" target="_blank"><strong>${result.name} (${result.connectionLevel})</strong></a>: ${result.headline}`;
        resultsDiv.appendChild(resultDiv);
      });
    } else {
      resultsDiv.innerHTML = "No results found.";
    }
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
