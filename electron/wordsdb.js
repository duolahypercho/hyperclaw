/**
 * Words Database Module
 * SQLite database for custom vocabulary
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// Database state
let db = null;

/**
 * Get the database file path
 */
function getDbPath() {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "words.db");
}

/**
 * Simple SQLite implementation using JSON file
 * (For production, use better-sqlite3)
 */
class WordsDB {
  constructor() {
    this.dbPath = getDbPath();
    this.words = [];
    this.load();
  }
  
  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, "utf8");
        this.words = JSON.parse(data);
      } else {
        this.words = [];
        this.save();
      }
    } catch (error) {
      console.error("[WordsDB] Error loading:", error);
      this.words = [];
    }
  }
  
  save() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(this.words, null, 2));
    } catch (error) {
      console.error("[WordsDB] Error saving:", error);
    }
  }
  
  getAll() {
    return this.words;
  }
  
  add(word, definition) {
    this.words.push({ word, definition, createdAt: new Date().toISOString() });
    this.save();
    return this.words;
  }
  
  delete(index) {
    if (index >= 0 && index < this.words.length) {
      this.words.splice(index, 1);
      this.save();
    }
    return this.words;
  }
  
  search(query) {
    const q = query.toLowerCase();
    return this.words.filter(w => 
      w.word.toLowerCase().includes(q) || 
      w.definition.toLowerCase().includes(q)
    );
  }
}

/**
 * Get or create database instance
 */
function getDB() {
  if (!db) {
    db = new WordsDB();
  }
  return db;
}

/**
 * Get all words
 */
function getWords() {
  return getDB().getAll();
}

/**
 * Add a new word
 */
function addWord(word, definition) {
  return getDB().add(word, definition);
}

/**
 * Delete a word by index
 */
function deleteWord(index) {
  return getDB().delete(index);
}

/**
 * Search words
 */
function searchWords(query) {
  return getDB().search(query);
}

module.exports = {
  getWords,
  addWord,
  deleteWord,
  searchWords,
  getDB,
};
