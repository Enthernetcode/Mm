"""
Email Extractor Backend
Flask application to handle file uploads and extract emails
"""

from flask import Flask, request, jsonify, render_template, send_file
import re
import os
import csv
import json
from werkzeug.utils import secure_filename
from datetime import datetime
import io

app = Flask(__name__)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')

# Allowed extensions (basically any text-based file)
ALLOWED_EXTENSIONS = {
    'txt', 'csv', 'json', 'html', 'htm', 'xml', 'log', 'md', 
    'js', 'py', 'php', 'sql', 'yaml', 'yml', 'ini', 'cfg',
    'conf', 'tsv', 'rtf', 'tex', 'sh', 'bat', 'ps1'
}

# Create necessary directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)


def allowed_file(filename):
    """Check if file extension is allowed"""
    if '.' not in filename:
        return True  # Allow files without extension
    return filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_emails_from_text(text):
    """
    Extract emails from text using regex
    Same pattern as the original script
    """
    email_pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    emails = re.findall(email_pattern, text)
    # Remove duplicates while preserving order
    seen = set()
    unique_emails = []
    for email in emails:
        email_lower = email.lower()
        if email_lower not in seen:
            seen.add(email_lower)
            unique_emails.append(email)
    return sorted(unique_emails, key=lambda x: x.lower())


def extract_company_from_email(email):
    """Extract company/domain name from email"""
    try:
        domain = email.split('@')[1]
        # Remove common TLDs to get company name
        company = domain.split('.')[0]
        return company.capitalize()
    except:
        return ""


def save_to_json(data, filename):
    """Save extracted data to JSON file"""
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
    return filepath


def save_to_csv(emails, filename):
    """Save extracted emails to CSV file"""
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Email', 'Company/Domain'])
        for email in emails:
            company = extract_company_from_email(email)
            writer.writerow([email, company])
    return filepath


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')


@app.route('/api/extract', methods=['POST'])
def extract_emails():
    """
    API endpoint to extract emails from uploaded file
    Returns JSON with extracted emails
    """
    # Check if file is present
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'error': 'No file uploaded'
        }), 400
    
    file = request.files['file']
    
    # Check if file is selected
    if file.filename == '':
        return jsonify({
            'success': False,
            'error': 'No file selected'
        }), 400
    
    try:
        # Read file content
        # Try different encodings
        content = None
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                file.seek(0)  # Reset file pointer
                content = file.read().decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            # If all encodings fail, read as binary and decode with errors='ignore'
            file.seek(0)
            content = file.read().decode('utf-8', errors='ignore')
        
        # Extract emails
        emails = extract_emails_from_text(content)
        
        # Generate timestamp for filenames
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Save results
        json_filename = f'emails_{timestamp}.json'
        csv_filename = f'emails_{timestamp}.csv'
        
        # Prepare data for JSON
        json_data = {
            'source_file': secure_filename(file.filename),
            'extraction_time': datetime.now().isoformat(),
            'total_emails': len(emails),
            'emails': [
                {
                    'email': email,
                    'company': extract_company_from_email(email)
                }
                for email in emails
            ]
        }
        
        # Save files
        json_path = save_to_json(json_data, json_filename)
        csv_path = save_to_csv(emails, csv_filename)
        
        return jsonify({
            'success': True,
            'total': len(emails),
            'emails': emails,
            'data': json_data['emails'],
            'files': {
                'json': json_filename,
                'csv': csv_filename
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/extract-text', methods=['POST'])
def extract_from_text():
    """
    API endpoint to extract emails from raw text (paste text directly)
    """
    data = request.get_json()
    
    if not data or 'text' not in data:
        return jsonify({
            'success': False,
            'error': 'No text provided'
        }), 400
    
    text = data['text']
    emails = extract_emails_from_text(text)
    
    return jsonify({
        'success': True,
        'total': len(emails),
        'emails': emails,
        'data': [
            {
                'email': email,
                'company': extract_company_from_email(email)
            }
            for email in emails
        ]
    })


@app.route('/api/download/<filename>')
def download_file(filename):
    """Download extracted results as CSV or JSON"""
    filename = secure_filename(filename)
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({
            'success': False,
            'error': 'File not found'
        }), 404
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=filename
    )


@app.route('/api/download-csv', methods=['POST'])
def download_csv_direct():
    """Generate and download CSV directly from email list"""
    data = request.get_json()
    
    if not data or 'emails' not in data:
        return jsonify({
            'success': False,
            'error': 'No emails provided'
        }), 400
    
    emails = data['emails']
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Email', 'Company/Domain'])
    
    for email in emails:
        company = extract_company_from_email(email)
        writer.writerow([email, company])
    
    # Create bytes buffer
    mem = io.BytesIO()
    mem.write(output.getvalue().encode('utf-8'))
    mem.seek(0)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    return send_file(
        mem,
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'extracted_emails_{timestamp}.csv'
    )


@app.route('/api/history')
def get_history():
    """Get extraction history"""
    output_folder = app.config['OUTPUT_FOLDER']
    
    if not os.path.exists(output_folder):
        return jsonify({
            'success': True,
            'extractions': []
        })
    
    files = os.listdir(output_folder)
    json_files = [f for f in files if f.endswith('.json')]
    
    extractions = []
    for jf in sorted(json_files, reverse=True)[:20]:  # Last 20 extractions
        filepath = os.path.join(output_folder, jf)
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                extractions.append({
                    'filename': jf,
                    'source': data.get('source_file', 'Unknown'),
                    'total': data.get('total_emails', 0),
                    'time': data.get('extraction_time', '')
                })
        except:
            continue
    
    return jsonify({
        'success': True,
        'extractions': extractions
    })


@app.route('/api/clear-history', methods=['POST'])
def clear_history():
    """Clear extraction history"""
    output_folder = app.config['OUTPUT_FOLDER']
    
    try:
        for f in os.listdir(output_folder):
            os.remove(os.path.join(output_folder, f))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Error handlers
@app.errorhandler(413)
def too_large(e):
    return jsonify({
        'success': False,
        'error': 'File too large. Maximum size is 16MB.'
    }), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
