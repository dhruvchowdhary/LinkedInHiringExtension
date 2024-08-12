document.addEventListener("DOMContentLoaded", () => {
  // Load previous selections from storage
  chrome.storage.local.get(["toggle1st", "toggle2nd", "toggle3rd"], (data) => {
    if (data.toggle1st) document.getElementById("toggle-1st").checked = true;
    if (data.toggle2nd) document.getElementById("toggle-2nd").checked = true;
    if (data.toggle3rd) document.getElementById("toggle-3rd").checked = true;
    displayWarning();
  });

  // Event listeners for toggles
  document.getElementById("toggle-1st").addEventListener("change", saveToggles);
  document.getElementById("toggle-2nd").addEventListener("change", saveToggles);
  document.getElementById("toggle-3rd").addEventListener("change", saveToggles);

  document.getElementById("check-hiring").addEventListener("click", () => {
    // Hide the "Check Hiring" button and show the "Stop" button when processing starts
    document.getElementById("check-hiring").style.display = "none";
    document.getElementById("stop-hiring").style.display = "block";

    // Clear previous results and state from local storage
    chrome.storage.local.remove(
      ["hiringResults", "currentPage", "processingComplete", "stopScript"],
      () => {
        console.log("Previous results and state cleared.");

        // Get toggle states
        const toggle1st = document.getElementById("toggle-1st").checked;
        const toggle2nd = document.getElementById("toggle-2nd").checked;
        const toggle3rd = document.getElementById("toggle-3rd").checked;

        // Generate the LinkedIn URL based on selections
        let network = [];
        if (toggle1st) network.push('"F"');
        if (toggle2nd) network.push('"S"');
        if (toggle3rd) network.push('"O"');

        const networkParam = `%5B${network.join("%2C")}%5D`;
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=hiring&network=${networkParam}&origin=FACETED_SEARCH`;

        // Reset the necessary variables and set the new search URL in storage
        chrome.storage.local.set(
          {
            stopScript: false,
            currentPage: 1,
            processingComplete: false,
            searchUrl: searchUrl,
          },
          () => {
            console.log("Search URL stored:", searchUrl);

            // Update the status immediately to show processing has started
            updateStatus("Processing...");

            // Navigate to the first search page immediately after setting the search URL
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              chrome.scripting.executeScript(
                {
                  target: { tabId: tabs[0].id },
                  function: (searchUrl) => (window.location.href = searchUrl),
                  args: [searchUrl],
                },
                () => {
                  console.log(
                    "Navigating to the search page and executing the content script."
                  );
                }
              );
            });
          }
        );
      }
    );
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

  function saveToggles() {
    const toggle1st = document.getElementById("toggle-1st").checked;
    const toggle2nd = document.getElementById("toggle-2nd").checked;
    const toggle3rd = document.getElementById("toggle-3rd").checked;

    // Save the selections to storage
    chrome.storage.local.set(
      {
        toggle1st: toggle1st,
        toggle2nd: toggle2nd,
        toggle3rd: toggle3rd,
      },
      () => {
        console.log("Toggles saved.");
        displayWarning();
      }
    );
  }

  function displayWarning() {
    const toggle3rd = document.getElementById("toggle-3rd").checked;
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
      resultsDiv.innerHTML = "No hiring results found.";
    }
  }

  function updateStatus(status) {
    const statusDiv = document.getElementById("status");
    statusDiv.textContent = status;
  }
});
