# 🚀 VocabMin Companion (Microsoft Edge 擴充功能)

專為 **Microsoft Edge 英文閱讀與內建 PDF 閱讀器** 量身打造的擴充功能（Manifest V3），完整移植 Chrome 版所有功能，並額外支援 **Edge 側邊欄 (Side Panel)** 常駐模式！將 VocabMin 的即時查詞、發音、長難句 AI 語法拆解與「一鍵收錄生字」無縫帶入您的 Edge 瀏覽器。

---

## ✨ 核心特色

1. **📄 Edge 網頁與內建 PDF 隨選即查**：
   - 瀏覽英文網頁或 PDF 時，選取任何單字即可看見浮動 **✨ 查單字** 按鈕。
   - 支援滑鼠右鍵選單：**「🔍 用 VocabMin 查詢單字」** 或 **「🧠 AI 語法結構解析」**（在 Edge 內建 PDF 檢視器中 100% 穩定支援！）。
2. **📌 Edge 專屬側邊欄 (Side Panel) 模式**：
   - 在任何頁面點擊滑鼠右鍵選擇 **「📌 在 Edge 側邊欄開啟 VocabMin 助手」**，即可將生字本與快速查詞固定在瀏覽器右側，邊讀論文邊查字！
3. **🔊 美式標準真人發音**：
   - 內建 Web Speech API 語音合成，點擊小喇叭即刻朗讀，支援 IPA 音標標註。
4. **🧠 AI 長難句結構剖析**：
   - 即時拆解主詞、謂語動詞、子句關係、分詞構句與修飾語，附帶高品質繁體中文翻譯與重點學習提示。
5. **⭐ 一鍵收錄至 VocabMin 單字庫**：
   - 點擊「收錄至 VocabMin」，自動保留生字、釋義、例句與原始文章語境上下文。
   - 支援一鍵將生字同步進已開啟的 VocabMin 學習中心網頁。
6. **🛡️ 零干擾 Shadow DOM 架構**：
   - 介面完全封裝於 Shadow DOM，絕對不破壞閱讀頁面的原始 CSS 排版，亦可自由拖曳調整視窗位置。
7. **🌐 離線彈性線路**：
   - 支援連接雲端伺服器（預設 `https://vocabmin.ai.studio`）或本地開發端點；若離線時自動啟用 Google Translate 與開放雙語辭典備援，永遠不報錯中斷閱讀。

---

## 🛠️ Microsoft Edge 安裝教學（30 秒完成）

### 步驟 1：開啟 Edge 擴充功能管理頁面
1. 在 Microsoft Edge 網址列輸入並前往：
   ```text
   edge://extensions/
   ```
2. 在頁面左側選單（或右上角）開啟 **「開發人員模式 (Developer mode)」** 開關。

### 步驟 2：載入擴充功能
1. 點擊上方的 **「載入解壓縮的擴充功能 (Load unpacked)」** 按鈕。
2. 選擇本專案中的 `extension-edge` 資料夾：
   ```text
   c:\Users\user\Desktop\Apps\vocabmin\extension-edge
   ```
3. 成功載入！您會在擴充功能清單中看到 **「VocabMin Companion (Edge 版) - 智慧英文閱讀與單字隨選助手」**。
4. 建議點擊網址列右側的「拼圖圖示 (擴充功能)」，將 **VocabMin Companion** 釘選至工具列。

---

## 📑 在 Edge 閱讀本機 PDF 檔案特別設定（關鍵！）

若您常使用 Microsoft Edge 直接開啟電腦本機的 PDF 論文或電子書（例如 `file:///C:/Users/.../paper.pdf`）：

1. 在 `edge://extensions/` 頁面找到 **VocabMin Companion (Edge 版)**。
2. 點擊 **「詳細資料 (Details)」**。
3. 勾選開啟 **「允許存取檔案 URL (Allow access to file URLs)」**。
4. 將您的 PDF 檔案直接拖進 Edge 瀏覽器分頁中，選取文字或點擊滑鼠右鍵即可查單字與解析長難句！

---

## 💡 使用小技巧

- **查單字**：在任何網頁選取單字，點擊浮現的「查單字」標籤，或在 PDF 中選取文字後按滑鼠右鍵選擇「🔍 用 VocabMin 查詢」。
- **開啟 Edge 側邊欄**：在頁面按滑鼠右鍵選擇「📌 在 Edge 側邊欄開啟 VocabMin 助手」，即可邊看文章邊對照收錄的單字。
- **解析長難句**：選取一整個句子，點擊浮動標籤或右鍵選單「🧠 AI 語法結構解析」，切換至「AI 句型解析」分頁。
- **同步單字**：點擊工具列上的 VocabMin 圖示，在「最近生字」點擊「🔄 同步到網頁」，即可將所有收錄的生字一次匯入 VocabMin 複習中心！
