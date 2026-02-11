#!/bin/bash

# Check for required arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <link_list_file> <output_folder>"
    exit 1
fi

# Input arguments
LINKS_FILE="$1"
OUTPUT_FOLDER="$2"

# Create the output folder if it doesn't exist
mkdir -p "$OUTPUT_FOLDER"

# Loop through each link in the file
while IFS= read -r link; do
    # Extract the path from the URL and use it as the filename
    filename=$(echo "$link" | awk -F/ '{print $NF}' | sed 's/[^a-zA-Z0-9_-]/_/g')

    # Run the curl and htmlq command, saving the result to the file
    curl --silent "$link" | htmlq ".available-content" > "$OUTPUT_FOLDER/$filename.html"

    echo "Processed: $link -> $OUTPUT_FOLDER/$filename.html"
done < "$LINKS_FILE"

echo "All links processed. Outputs saved to '$OUTPUT_FOLDER'."
