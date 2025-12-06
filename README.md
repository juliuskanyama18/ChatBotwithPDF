# Interactive PDF Chatbot Web App (ChatPDF)

This web application allows users to upload a PDF, view it page-by-page in a page viewer, and interact with a chatbot that responds based on the content of the uploaded document. The system supports English and Turkish languages, voice interaction, translation, and intelligent response generation powered by OpenAI API.

## Features

- 📄 **PDF Viewer:** A4-style preview of uploaded PDF with canvas rendering for each page.
- 🧠 **Chatbot:** Interacts with users based on the PDF content.
- 🌐 **Language Support:** English and Turkish language toggle for all UI and chatbot content.
- 🔈 **Text-to-Speech:** Chatbot messages are read out loud in the selected language.
- 🌍 **Translation:** some specific page content, chatbot and user messages are translated dynamically.
- ⚙️ **Multi-page Support:** Extracts and displays content for each page with page number indexing.

## Technologies Used

- **Node.js & Express** – Backend server
- **EJS** – Templating engine
- **pdfjs-dist** – Renders PDF pages
- **OpenAI API** – Chatbot responses based on PDF content
- **i18next** – Internationalization (i18n)
- **JavaScript (Client-side)** – UI handling, chat functions, canvas rendering

## Installation

1. **Clone the repository**
 ```bash commands
   git clone   https://github.com/juliuskanyama18/CHATPDF.git
 
   cd chatpdf-clone
```

2. **Install dependencies**
``` bash
   npm install
```

3. **Set up environment variables**
    'Create a .env file in the root with:'

    OPENAI_API_KEY=your_openai_api_key.                
    SESSION_SECRET=your_secure_session_secret.

4. **Run the app**
``` bash
    node app.js 
```

5. **Visit in browser**

    http://localhost:3600


**FOLDER STRUCTURE**
``` bash
   CHAPDF-root/
│
├── node_modules/
├── pdfs/                         # Uploaded PDF files
│ 
├── public/                       # Static files (JS, CSS, images)
│   ├── assets/
│   └── images/
│   └── scripts/
│   └── styles/
│ 
├── test/
├── translations/                  
│
├── views/                       # EJS templates
│   ├── index.ejs
│   └── convertPdf.ejs
│                
│
├── .env                       # Environment variables
├── .gitignore
├── app.js                     # Main route handling                  
├── package.json
└── README.md                   
```


**How It Works**
    1. PDF Upload: User uploads a PDF via index.ejs.

    2. Preview: The PDF is rendered using pdfjs-dist with canvas overlays per page in convertPdf.ejs.

    3. Text Extraction: Each page's text is extracted and stored for chatbot reference.

    4. Chat: User inputs questions related to the document. The server matches content per page and sends context to OpenAI.

    5. Response: The chatbot responds with relevant answers, translated to the chosen language and optionally spoken aloud.


**Language Support**
    The app supports English and Turkish. Language selection changes the UI and chatbot messages. All translations are handled dynamically using i18next.