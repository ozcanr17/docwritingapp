package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func main() {
	if len(os.Args) != 3 {
		panic("usage: packager source destination")
	}
	source, err := filepath.Abs(os.Args[1])
	if err != nil {
		panic(err)
	}
	output, err := os.Create(os.Args[2])
	if err != nil {
		panic(err)
	}
	archive := zip.NewWriter(output)
	count := 0
	err = filepath.Walk(source, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == source {
			return nil
		}
		relative, relativeErr := filepath.Rel(source, path)
		if relativeErr != nil {
			return relativeErr
		}
		header, headerErr := zip.FileInfoHeader(info)
		if headerErr != nil {
			return headerErr
		}
		header.Name = filepath.ToSlash(relative)
		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}
		writer, createErr := archive.CreateHeader(header)
		if createErr != nil {
			return createErr
		}
		if info.IsDir() {
			return nil
		}
		input, openErr := os.Open(path)
		if openErr != nil {
			return openErr
		}
		_, copyErr := io.Copy(writer, input)
		input.Close()
		count++
		if count%2000 == 0 {
			fmt.Printf("Packed %d files\n", count)
		}
		return copyErr
	})
	closeErr := archive.Close()
	output.Close()
	if err != nil {
		panic(err)
	}
	if closeErr != nil {
		panic(closeErr)
	}
	fmt.Printf("Packed %d files\n", count)
}
