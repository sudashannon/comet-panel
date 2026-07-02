package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"comet-ui/chat"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	port := flag.Int("port", 8989, "port to listen on")
	baseDir := flag.String("dir", "openspec", "path to openspec directory")
	flag.Parse()

	mux := http.NewServeMux()

	mux.HandleFunc("/api/changes", func(w http.ResponseWriter, r *http.Request) {
		handleListChanges(w, r, *baseDir)
	})
	mux.HandleFunc("/api/changes/", func(w http.ResponseWriter, r *http.Request) {
		handleGetChange(w, r, *baseDir)
	})
	mux.HandleFunc("/api/artifact", func(w http.ResponseWriter, r *http.Request) {
		handleGetArtifact(w, r, *baseDir)
	})

	mux.HandleFunc("/api/chat/message", chat.HandleMessage(*baseDir, *baseDir))
	mux.HandleFunc("/api/chat/session", chat.HandleSession)
	mux.HandleFunc("/api/chat/config", chat.HandleConfig)
	mux.HandleFunc("/api/chat/providers", chat.HandleProviders)

	mux.Handle("/static/", http.FileServer(http.FS(staticFiles)))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		data, err := staticFiles.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "index not found", 500)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	addr := fmt.Sprintf(":%d", *port)
	url := fmt.Sprintf("http://localhost:%d", *port)
	fmt.Printf("Comet UI Dashboard → %s\n", url)

	go openBrowser(url)

	log.Fatal(http.ListenAndServe(addr, mux))
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		return
	}
	cmd.Start()
}

func writeJSONError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func getDir(r *http.Request, defaultDir string) string {
	d := r.URL.Query().Get("dir")
	if d == "" {
		return defaultDir
	}
	return d
}

func handleListChanges(w http.ResponseWriter, r *http.Request, baseDir string) {
	dir := getDir(r, baseDir)
	w.Header().Set("Content-Type", "application/json")
	changes, err := scanAllChanges(dir)
	if err != nil {
		writeJSONError(w, err.Error(), 500)
		return
	}
	enc := json.NewEncoder(w)
	enc.Encode(map[string]interface{}{"changes": changes, "dir": dir})
}

func handleGetChange(w http.ResponseWriter, r *http.Request, baseDir string) {
	dir := getDir(r, baseDir)
	name := strings.TrimPrefix(r.URL.Path, "/api/changes/")
	name = filepath.Clean(name)
	if name == "" || name == "." {
		writeJSONError(w, "missing name", 400)
		return
	}
	if strings.Contains(name, "..") || strings.Contains(name, "/") {
		writeJSONError(w, "invalid name", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	detail, err := scanChangeDetail(dir, name)
	if err != nil {
		writeJSONError(w, err.Error(), 404)
		return
	}
	enc := json.NewEncoder(w)
	enc.Encode(detail)
}

func handleGetArtifact(w http.ResponseWriter, r *http.Request, baseDir string) {
	dir := getDir(r, baseDir)
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "missing path", 400)
		return
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		writeJSONError(w, "invalid path", 400)
		return
	}
	rootAbs, _ := filepath.Abs(filepath.Join(dir, ".."))
	if !strings.HasPrefix(absPath, rootAbs) {
		writeJSONError(w, "path outside project directory", 403)
		return
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
		writeJSONError(w, "file not found", 404)
		return
	}

	ext := filepath.Ext(absPath)
	ct := mime.TypeByExtension(ext)
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Write(content)
}
