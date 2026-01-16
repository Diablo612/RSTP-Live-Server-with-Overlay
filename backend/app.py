from flask import Flask, request, jsonify, send_from_directory
from flask_pymongo import PyMongo
from flask_cors import CORS
from bson.objectid import ObjectId
import os

app = Flask(__name__)
CORS(app)

# MongoDB config
app.config["MONGO_URI"] = "mongodb://localhost:27017/overlaydb"
mongo = PyMongo(app)

# Ensure stream directory exists
STREAM_DIR = os.path.join(os.path.dirname(__file__), 'stream')
os.makedirs(STREAM_DIR, exist_ok=True)

# Test route
@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Backend is running 🚀"})

# Serve HLS stream files
@app.route("/stream/<path:filename>", methods=["GET"])
def serve_stream(filename):
    """Serve .m3u8 and .ts files for HLS playback"""
    return send_from_directory(STREAM_DIR, filename)

# CREATE overlay
@app.route("/overlays", methods=["POST"])
def create_overlay():
    """Create a new overlay"""
    data = request.json
    
    # Validate required fields
    if not data.get('type'):
        return jsonify({"error": "Overlay type is required"}), 400
    
    overlay_id = mongo.db.overlays.insert_one(data).inserted_id
    return jsonify({"id": str(overlay_id)}), 201

# READ overlays
@app.route("/overlays", methods=["GET"])
def get_overlays():
    """Get all overlays"""
    overlays = []
    for overlay in mongo.db.overlays.find():
        overlay["_id"] = str(overlay["_id"])
        overlays.append(overlay)
    return jsonify(overlays)

# READ single overlay
@app.route("/overlays/<id>", methods=["GET"])
def get_overlay(id):
    """Get a single overlay by ID"""
    try:
        overlay = mongo.db.overlays.find_one({"_id": ObjectId(id)})
        if overlay:
            overlay["_id"] = str(overlay["_id"])
            return jsonify(overlay)
        return jsonify({"error": "Overlay not found"}), 404
    except:
        return jsonify({"error": "Invalid overlay ID"}), 400

# UPDATE overlay
@app.route("/overlays/<id>", methods=["PUT"])
def update_overlay(id):
    """Update an overlay"""
    try:
        data = request.json
        result = mongo.db.overlays.update_one(
            {"_id": ObjectId(id)},
            {"$set": data}
        )
        
        if result.matched_count:
            return jsonify({"message": "Overlay updated successfully"})
        return jsonify({"error": "Overlay not found"}), 404
    except:
        return jsonify({"error": "Invalid overlay ID"}), 400

# DELETE overlay
@app.route("/overlays/<id>", methods=["DELETE"])
def delete_overlay(id):
    """Delete an overlay"""
    try:
        result = mongo.db.overlays.delete_one({"_id": ObjectId(id)})
        
        if result.deleted_count:
            return jsonify({"message": "Overlay deleted successfully"})
        return jsonify({"error": "Overlay not found"}), 404
    except:
        return jsonify({"error": "Invalid overlay ID"}), 400

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)