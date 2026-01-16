import subprocess
import sys
import os

STREAM_DIR = "stream"

def stream_to_hls(source):

    os.makedirs(STREAM_DIR, exist_ok=True)

    output_path = os.path.join(STREAM_DIR, "stream.m3u8")

    command = [
        "ffmpeg",
        "-re",
        "-i", source,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-c:a", "aac",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments",
        output_path
    ]

    print("\nStarting HLS stream...")
    print("Output:", output_path)

    subprocess.run(command)


if __name__ == "__main__":

    if len(sys.argv) < 2:
        print("Usage:")
        print("python stream_rtsp.py <rtsp_url OR video_file>")
        sys.exit(1)

    stream_to_hls(sys.argv[1])
