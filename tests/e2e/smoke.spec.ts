import { expect, test } from "@playwright/test";

test("home page renders primary navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "ZK P2P" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buy Crypto" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sell Crypto" })).toBeVisible();
});

test("sell page can reach review state", async ({ page }) => {
  await page.goto("/sell");

  await expect(page.getByRole("heading", { name: "Sell Crypto" })).toBeVisible();
  await page.getByRole("button", { name: /BTC/i }).first().click();

  await page.getByPlaceholder("0.00").fill("0.01");
  await page
    .getByPlaceholder(/Bitcoin address \(testnet: tb1... or mainnet: bc1...\)/i)
    .fill("tb1qexampleaddress0000000000000000000000000");

  const reviewDeposit = page.getByRole("button", { name: "Review Deposit" });
  await expect(reviewDeposit).toBeEnabled();
  await reviewDeposit.click();

  await expect(page.getByRole("heading", { name: "Confirm Deposit" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect NEAR Wallet to Continue" }),
  ).toBeVisible();
});

test("buy page loads funded listings section", async ({ page }) => {
  await page.goto("/buy");

  await expect(page.getByRole("heading", { name: "Buy Crypto" })).toBeVisible();
  await page.getByRole("button", { name: /BTC/i }).first().click();

  await expect(page.getByText("Funded Listings (BTC)")).toBeVisible();
  await expect(page.getByText(/Asset ID:/)).toBeVisible();
});
