# VocabMin 雲端發布與部署指南 (Deployment Guide)

本專案是一個全端應用程式（前端 React 19 + Vite，後端 Express + Google Gemini API）。
以下提供四種最常見且方便的雲端發布方式，建議依照您的使用習慣選擇：

---

## 推薦方案一：Render (完全免費、最穩定、最推薦)

Render 提供免費的 Web Service，原生支援 Node.js + Express，且已為您準備好 `render.yaml`。

### 步驟：
1. **建立 GitHub 儲存庫 (Repository)**：
   - 前往 [GitHub](https://github.com/new) 建立一個新的公開或私有 Repo（例如命名為 `vocabmin`）。
   - 在本機終端機執行：
     ```bash
     git remote add origin https://github.com/<您的GitHub帳號>/vocabmin.git
     git branch -M main
     git push -u origin main
     ```
2. **註冊並登入 Render**：
   - 前往 [render.com](https://render.com/)，使用 GitHub 帳號登入。
3. **建立 Web Service**：
   - 點擊 **New +** -> **Web Service**。
   - 選擇您剛才上傳的 `vocabmin` GitHub 儲存庫。
   - 設定如下：
     - **Name**: `vocabmin`
     - **Region**: Singapore 或 Oregon
     - **Branch**: `main`
     - **Runtime**: `Node`
     - **Build Command**: `npm install --legacy-peer-deps && npm run build`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`
4. **加入環境變數**：
   - 在 **Environment Variables** 區塊中點擊 **Add Environment Variable**：
     - Key: `GEMINI_API_KEY`
     - Value: *(填入您的 Google Gemini API Key)*
     - Key: `NODE_ENV`
     - Value: `production`
5. **點擊 Create Web Service**：
   - 等待約 2~3 分鐘建置完成後，Render 就會提供一個專屬的公開網址（例如：`https://vocabmin.onrender.com`），任何人都能直接在瀏覽器使用！

---

## 推薦方案二：Zeabur (繁體中文介面、亞洲節點、速度極快)

Zeabur 是許多台灣開發者喜愛的雲端平台，直接支援台灣與亞洲節點，介面全中文且操作極簡。

### 步驟：
1. 將專案推送到 GitHub。
2. 前往 [zeabur.com](https://zeabur.com/) 並使用 GitHub 登入。
3. 建立一個專案，點擊「建立服務」->「Git 儲存庫」，選擇 `vocabmin`。
4. Zeabur 會自動辨識 Node.js 專案並以 Dockerfile 自動編譯。
5. 前往「變數 (Variables)」頁面，新增環境變數：
   - `GEMINI_API_KEY`: *(您的 Gemini API Key)*
6. 在「網域名稱 (Domains)」頁面點擊「生成免費網域名稱」，即可獲得 `https://vocabmin.zeabur.app` 公開網址！

---

## 推薦方案三：Vercel

專案內已包含 `vercel.json` 設定檔。

### 步驟：
1. 將專案推送到 GitHub。
2. 前往 [vercel.com](https://vercel.com/)，使用 GitHub 登入。
3. 點擊 **Add New Project**，匯入 `vocabmin`。
4. 在 **Environment Variables** 加入：
   - `GEMINI_API_KEY`: *(您的 Gemini API Key)*
5. 點擊 **Deploy** 即可完成！

---

## 推薦方案四：Google AI Studio（原生發布）

如果您一開始是在 Google AI Studio 介面建立本專案：
1. 打開您的 AI Studio 專案：[https://ai.studio/apps/628d822c-79b6-4a53-aade-5fe6f52e6e3a](https://ai.studio/apps/628d822c-79b6-4a53-aade-5fe6f52e6e3a)
2. 在右上角點擊 **Share** 或 **Publish** 按鈕。
3. 系統會自動託管於 Google Cloud Run 並生成公開分享連結，由 Google AI Studio 直接管理 API 金鑰。
