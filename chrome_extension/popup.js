document.getElementById("check-hiring").addEventListener("click", () => {
  // Show the stop button when processing starts
  document.getElementById("stop-hiring").style.display = "block";

  // Reset the necessary variables and clear the storage
  chrome.storage.local.set(
    {
      stopScript: false,
      currentPage: 1,
      processingComplete: false,
    },
    () => {
      chrome.storage.local.clear(() => {
        console.log("Cleared previous results and reset variables.");

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.scripting.executeScript(
            {
              target: { tabId: tabs[0].id },
              files: ["content.js"],
            },
            () => {
              console.log("Content script executed.");
              updateStatus("Processing... Page 1, Found 0 people hiring!");
            }
          );
        });
      });
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

    // Hide the stop button when processing is complete or stopped
    if (
      message.status.includes("Complete") ||
      message.status.includes("Stopped")
    ) {
      document.getElementById("stop-hiring").style.display = "none";
    }
  }
});

function displayResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (results && results.length > 0) {
    results.forEach((result) => {
      const resultDiv = document.createElement("div");
      resultDiv.innerHTML = `<a href="${result.profileLink}" target="_blank"><strong>${result.name}</strong></a>: ${result.headline}`;
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

// Load previous results on popup open
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get("hiringResults", (data) => {
    if (data.hiringResults && data.hiringResults.length > 0) {
      displayResults(data.hiringResults);
      updateStatus(
        `Previously found ${data.hiringResults.length} people hiring!`
      );
    } else {
      updateStatus("Idle");
    }
  });
});
