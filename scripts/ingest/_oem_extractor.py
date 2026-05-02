
import sys, json, re, pdfplumber

PART_ROW_RE   = re.compile(r'^(?:\d+\s+)?([0-9A-Z]{4,8}-[0-9]{2}[A-Z]{0,2})\s+(.+)$')
MODEL_BARE_RE = re.compile(r'^(XL[0-9A-Z]+|XLH[0-9A-Z]*|XR[0-9A-Z]+|ALL)$')
CONT_RE       = re.compile(r'^(XL[0-9A-Z]+|XLH|XR[0-9A-Z]+|ALL)[\s,0-9A-Z]*$')
PART_NO_ANY   = re.compile(r'[0-9]{4,8}-[0-9]{2}')
SECTION_SKIP  = re.compile(r'^(VIEW|INDEX|PART NO|NO\.|TABLE|POSITION|MARKET|ASSEMBLY|VIN )', re.I)
COLUMN_HDR    = re.compile(r'INDEX.*PART|PART.*DESCRIPTION|NO\.\s+NO\.', re.I)
MODEL_ONLY_RE = re.compile(r'^(XL[0-9A-Z]+|XLH[0-9A-Z]*|XR[0-9A-Z]+|ALL)(\s*[,\s]\s*(XL[0-9A-Z]+|XLH|XR[0-9A-Z]+|ALL|\d{4}))*$')
QTY_RE        = re.compile(r'\(\d+\)\s*$|\(\d+ required\)\s*$|\(use [^)]+\)\s*$')

def is_section(line):
    line = line.strip()
    if len(line) < 6 or len(line) > 90: return False
    if PART_NO_ANY.search(line): return False
    if COLUMN_HDR.search(line): return False
    if SECTION_SKIP.match(line): return False
    if MODEL_ONLY_RE.match(line): return False
    alpha = re.sub(r'[^A-Za-z]', '', line)
    if not alpha or len(alpha) < 4: return False
    upper_ratio = sum(1 for c in alpha if c.isupper()) / len(alpha)
    has_struct = any(ch in line for ch in [' ', '-', '&', ',', '('])
    return upper_ratio > 0.85 and has_struct

def parse_codes(raw):
    return [p.strip().rstrip(',') for p in re.split(r'[,\s]+', raw.strip())
            if MODEL_BARE_RE.match(p.strip().rstrip(','))]

def split_desc_models(rest):
    tokens = rest.split()
    model_start = len(tokens)
    i = len(tokens) - 1
    while i >= 0:
        tok = tokens[i].rstrip(',')
        if MODEL_BARE_RE.match(tok):
            model_start = i
            i -= 1
        elif re.match(r'^\d{4}$', tok) and model_start < len(tokens):
            i -= 1   # year qualifier attached to model code
        else:
            break
    desc       = ' '.join(tokens[:model_start]).rstrip(',').strip()
    models_raw = ' '.join(tokens[model_start:]).strip()
    codes      = parse_codes(models_raw)
    qty_note   = None
    qm = QTY_RE.search(desc)
    if qm:
        qty_note = qm.group(0).strip()
        desc = desc[:qm.start()].strip()
    return desc, qty_note, models_raw, codes

args     = json.loads(sys.argv[1])
pdf_path = args['path']
ys       = args['ys']
ye       = args['ye']
filename = args['filename']

try:
    pdf = pdfplumber.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': str(e), 'rows': []}))
    sys.exit(0)

rows     = []
section  = 'UNKNOWN'
last_row = None

for i, page in enumerate(pdf.pages):
    if i < 7: continue
    text = page.extract_text()
    if not text: continue
    for line in text.split('\n'):
        line = line.strip()
        if not line: continue

        if is_section(line):
            section  = line
            last_row = None
            continue

        # Continuation: model list wrapped to next line
        if last_row is not None and CONT_RE.match(line):
            extra = parse_codes(line)
            if extra:
                last_row['model_codes'].extend(extra)
                last_row['models_raw'] += ' ' + line
                if 'ALL' in last_row['model_codes']:
                    last_row['model_codes']     = ['ALL']
                    last_row['fits_all_models'] = True
            continue

        m = PART_ROW_RE.match(line)
        if m:
            if last_row:
                rows.append(last_row)
            desc, qty_note, models_raw, codes = split_desc_models(m.group(2))
            fits_all = 'ALL' in codes
            if fits_all: codes = ['ALL']
            last_row = {
                'catalog_year_start': ys,
                'catalog_year_end':   ye,
                'catalog_file':       filename,
                'page_number':        i + 1,
                'section':            section,
                'oem_part_no':        m.group(1),
                'description':        desc,
                'qty_note':           qty_note,
                'models_raw':         models_raw,
                'model_codes':        codes,
                'fits_all_models':    fits_all,
            }
        else:
            if last_row:
                rows.append(last_row)
                last_row = None

if last_row:
    rows.append(last_row)

print(json.dumps({'rows': rows}))
