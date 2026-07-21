import streamlit as st
import json
import os
import urllib.request
import urllib.parse
from xml.etree import ElementTree
from datetime import datetime, timedelta
import pandas as pd
import yfinance as yf
import plotly.graph_objects as go
from io import BytesIO

# Import ReportLab for PDF generation
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, PolyLine, String, Line

# Page Config
st.set_page_config(
    page_title="Howe Robinson Partners - Stock Terminal",
    page_icon="🛳️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Dark Theme styling injected via st.markdown
st.markdown("""
<style>
    /* Dark Theme Core Styles */
    .stApp {
        background-color: #060913;
        background-image: 
            radial-gradient(at 0% 0%, rgba(5, 213, 255, 0.04) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(0, 255, 135, 0.02) 0px, transparent 50%);
        color: #f3f4f6;
    }
    
    /* Sidebar styling */
    section[data-testid="stSidebar"] {
        background-color: rgba(13, 20, 38, 0.9) !important;
        border-right: 1px solid rgba(0, 130, 240, 0.18);
    }
    
    /* Cards and Containers styling */
    div.stElementContainer {
        border-radius: 6px;
    }
    
    /* Custom Card Style for Rate Analysis */
    .metric-card {
        background: rgba(13, 20, 38, 0.7);
        border: 1px solid rgba(0, 130, 240, 0.15);
        border-radius: 6px;
        padding: 15px;
        box-shadow: 0 0 15px rgba(0, 130, 240, 0.05);
    }
    
    /* Scrollbars */
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track {
        background: #060913;
    }
    ::-webkit-scrollbar-thumb {
        background: rgba(0, 130, 240, 0.3);
        border-radius: 3px;
    }
</style>
""", unsafe_allow_html=True)

# Helper: Load Databases
@st.cache_data
def load_company_databases():
    resolved_path = 'resolved_companies.json'
    unresolved_path = 'unresolved_companies.json'
    
    if os.path.exists(resolved_path):
        with open(resolved_path, 'r', encoding='utf-8') as f:
            resolved = json.load(f)
    else:
        resolved = []
        
    if os.path.exists(unresolved_path):
        with open(unresolved_path, 'r', encoding='utf-8') as f:
            unresolved = json.load(f)
    else:
        unresolved = []
        
    return resolved, unresolved

COMPANIES, UNRESOLVED = load_company_databases()

# Helper: Fetch Google News RSS Feed
@st.cache_data(ttl=900) # 15 minutes cache
def fetch_news(company_name):
    query = f"{company_name} shipping stock"
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            xml_data = response.read()
            root = ElementTree.fromstring(xml_data)
            items = []
            for item in root.findall('.//item')[:8]:
                title = item.find('title').text if item.find('title') is not None else 'No Title'
                link = item.find('link').text if item.find('link') is not None else ''
                pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
                source = item.find('source').text if item.find('source') is not None else 'Unknown'
                items.append({
                    'title': title,
                    'link': link,
                    'pubDate': pub_date,
                    'source': source
                })
            return items
    except Exception as e:
        return []

# Helper: Fetch Stock Data from yfinance
@st.cache_data(ttl=300) # 5 minutes cache
def fetch_stock_data(symbol):
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="20y")
        if df.empty:
            return None, None
            
        # Get currency
        currency = ticker.info.get('currency', 'USD')
        return df, currency
    except Exception as e:
        return None, None

# Helper: Draw trend line in PDF using ReportLab shapes
def draw_chart_in_pdf(prices, width=500, height=130):
    drawing = Drawing(width, height)
    # Background Box
    drawing.add(Rect(0, 0, width, height, fillColor=colors.HexColor('#0d1426'), strokeColor=colors.HexColor('#00566c'), strokeWidth=1))
    
    # Filter points for smoother vector rendering (max 200 points)
    step = max(1, len(prices) // 200)
    sampled = prices[::step]
    
    if not sampled:
        return drawing
        
    min_p, max_p = min(prices), max(prices)
    p_range = max_p - min_p if max_p != min_p else 1
    
    points = []
    for i, p in enumerate(sampled):
        x = (i / (len(sampled) - 1)) * (width - 40) + 20
        y = ((p - min_p) / p_range) * (height - 40) + 20
        points.append((x, y))
        
    # Draw line plot
    flat_points = [coord for pt in points for coord in pt]
    drawing.add(PolyLine(flat_points, strokeColor=colors.HexColor('#0082f0'), strokeWidth=2))
    
    # Text labels
    drawing.add(String(20, height - 15, f"5-Year High: {max_p:.2f}", fillColor=colors.HexColor('#00ff87'), fontSize=8, fontName='Helvetica-Bold'))
    drawing.add(String(20, 5, f"5-Year Low: {min_p:.2f}", fillColor=colors.HexColor('#ff4b4b'), fontSize=8, fontName='Helvetica-Bold'))
    return drawing

# PDF Exporters (ReportLab)
def generate_single_company_pdf(company_name, symbol, category, region, currency, rates, prices_5y, news):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    story = []
    
    # Typography Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        textColor=colors.HexColor('#ffffff'),
        spaceAfter=3
    )
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        textColor=colors.HexColor('#f3f4f6')
    )
    section_title = ParagraphStyle(
        'SecTitle',
        fontName='Helvetica-Bold',
        fontSize=11,
        textColor=colors.HexColor('#003a6c'),
        spaceBefore=15,
        spaceAfter=8
    )
    company_title = ParagraphStyle(
        'CompTitle',
        fontName='Helvetica-Bold',
        fontSize=14,
        textColor=colors.HexColor('#003a6c'),
        spaceBefore=10,
        spaceAfter=4
    )
    meta_text = ParagraphStyle(
        'MetaTxt',
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.HexColor('#646464')
    )
    news_title_style = ParagraphStyle(
        'NewsTitle',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        textColor=colors.HexColor('#003a6c'),
        spaceAfter=2
    )
    news_meta_style = ParagraphStyle(
        'NewsMeta',
        fontName='Helvetica-Oblique',
        fontSize=7.5,
        textColor=colors.HexColor('#646464')
    )

    # 1. Header Banner
    banner_data = [
        [Paragraph("HOWE ROBINSON PARTNERS", title_style)],
        [Paragraph("COMPANY RESEARCH & FINANCIAL REPORT", subtitle_style)]
    ]
    banner_table = Table(banner_data, colWidths=[532])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#003a6c')),
        ('TOPPADDING', (0,0), (-1,-1), 16),
        ('BOTTOMPADDING', (0,0), (-1,-1), 16),
        ('LEFTPADDING', (0,0), (-1,-1), 20),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('LINEBELOW', (0,0), (-1,-1), 4, colors.HexColor('#cf2027'))
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 15))

    # 2. Company Info
    story.append(Paragraph(company_name, company_title))
    story.append(Paragraph(f"Symbol: {symbol}   |   Sector: {category}   |   Region: {region}   |   Currency: {currency}", meta_text))
    story.append(Spacer(1, 10))

    # Line Separator
    sep = Table([['']], colWidths=[532])
    sep.setStyle(TableStyle([
        ('LINEABOVE', (0,0), (-1,-1), 1.5, colors.HexColor('#003a6c')),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0)
    ]))
    story.append(sep)
    story.append(Spacer(1, 12))

    # 3. Financial Table
    sign = "+" if rates['daily_change'] >= 0 else ""
    w_sign = "+" if rates['wow_change'] >= 0 else ""
    
    fin_data = [
        ['Metric', 'Value'],
        ['Today\'s Active Rate', f"{rates['price']:.2f} {currency}"],
        ['Yesterday\'s Close Rate', f"{rates['prev_close']:.2f} {currency}"],
        ['Daily Change', f"{sign}{rates['daily_change']:.2f} ({sign}{rates['daily_change_pct']:.2f}%)"],
        ['Weekly Change (WoW)', f"{w_sign}{rates['wow_change']:.2f} ({w_sign}{rates['wow_change_pct']:.2f}%)"],
        ['52-Week High', f"{rates['high_52']:.2f} {currency}"],
        ['52-Week Low', f"{rates['low_52']:.2f} {currency}"]
    ]
    fin_table = Table(fin_data, colWidths=[200, 332])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003a6c')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 9.5),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f8f9fa')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8f9fa'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('FONTSIZE', (0,1), (-1,-1), 9)
    ]))
    story.append(fin_table)
    story.append(Spacer(1, 20))

    # 4. Chart Visualization
    story.append(Paragraph("5-Year Price Trend Analytics", section_title))
    drawing = draw_chart_in_pdf(prices_5y)
    story.append(drawing)
    story.append(Spacer(1, 20))

    # 5. News Section
    if news:
        story.append(Paragraph("Latest Market News & Developments", section_title))
        news_rows = []
        for item in news[:5]:
            dt_str = ""
            if item.get('pubDate'):
                try:
                    dt = datetime.strptime(item['pubDate'][:25].strip(), "%a, %d %b %Y %H:%M:%S")
                    dt_str = dt.strftime("%b %d, %Y")
                except:
                    dt_str = item['pubDate']
            
            p_title = Paragraph(item['title'], news_title_style)
            p_meta = Paragraph(f"{item.get('source', 'News')} - {dt_str}", news_meta_style)
            news_rows.append([p_title])
            news_rows.append([p_meta])
            news_rows.append([Spacer(1, 4)])
            
        news_table = Table(news_rows, colWidths=[532])
        news_table.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#e9ecef')),
            ('PADDING', (0,0), (-1,-1), 2),
            ('ALIGN', (0,0), (-1,-1), 'LEFT')
        ]))
        story.append(news_table)

    # Footer Setup (Page Number helper)
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica-Oblique', 8)
        canvas.setFillColor(colors.HexColor('#9ca3af'))
        canvas.drawString(40, 30, f"Howe Robinson Partners  |  Generated Page {doc.page}  |  Strictly Confidential")
        canvas.restoreState()

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    buffer.seek(0)
    return buffer.getvalue()

def generate_consolidated_pdf(category_name, company_list):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), leftMargin=30, rightMargin=30, topMargin=35, bottomMargin=35)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        textColor=colors.white,
        spaceAfter=2
    )
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        textColor=colors.HexColor('#f3f4f6')
    )

    # Header Banner
    banner_text = f"CONSOLIDATED {category_name.upper()} SECTOR REPORT"
    banner_data = [
        [Paragraph("HOWE ROBINSON PARTNERS", title_style)],
        [Paragraph(f"{banner_text}  |  GENERATED ON {datetime.now().strftime('%Y-%m-%d')} UTC", subtitle_style)]
    ]
    banner_table = Table(banner_data, colWidths=[732])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#003a6c')),
        ('TOPPADDING', (0,0), (-1,-1), 14),
        ('BOTTOMPADDING', (0,0), (-1,-1), 14),
        ('LEFTPADDING', (0,0), (-1,-1), 20),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('LINEBELOW', (0,0), (-1,-1), 3.5, colors.HexColor('#cf2027'))
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 15))

    # Table Setup
    headers = ['Company Name', 'Ticker', 'Region', 'Currency', 'Today Rate', 'Yesterday Close', 'Change', 'Change %', 'WoW Change', 'WoW %']
    table_rows = [headers]
    
    for comp in company_list:
        symbol = comp['symbol']
        
        df, currency = fetch_stock_data(symbol)
        if df is not None and len(df) > 1:
            close_prices = df['Close'].tolist()
            price = close_prices[-1]
            prev_close = close_prices[-2]
            daily_change = price - prev_close
            daily_change_pct = (daily_change / prev_close) * 100
            
            wow_change = 0.0
            wow_change_pct = 0.0
            if len(close_prices) >= 6:
                wow_change = price - close_prices[-6]
                wow_change_pct = (wow_change / close_prices[-6]) * 100
                
            sign = "+" if daily_change >= 0 else ""
            w_sign = "+" if wow_change >= 0 else ""
            
            table_rows.append([
                comp['name'],
                symbol,
                comp['region'],
                currency,
                f"{price:.2f}",
                f"{prev_close:.2f}",
                f"{sign}{daily_change:.2f}",
                f"{sign}{daily_change_pct:.2f}%",
                f"{w_sign}{wow_change:.2f}",
                f"{w_sign}{wow_change_pct:.2f}%"
            ])
        else:
            table_rows.append([
                comp['name'],
                symbol,
                comp['region'],
                'USD',
                'Crawling...',
                'Crawling...',
                '--',
                '--',
                '--',
                '--'
            ])
            
    col_widths = [160, 62, 50, 45, 58, 62, 60, 52, 62, 52]
    table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#003a6c')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8f9fa'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('ALIGN', (0,1), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 5),
        ('FONTSIZE', (0,1), (-1,-1), 8)
    ]))
    story.append(table)

    def add_footer_landscape(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica-Oblique', 8)
        canvas.setFillColor(colors.HexColor('#9ca3af'))
        canvas.drawString(30, 20, f"Howe Robinson Partners  |  Consolidated Sector Report  |  Page {doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=add_footer_landscape, onLaterPages=add_footer_landscape)
    buffer.seek(0)
    return buffer.getvalue()


# ===== APPLICATION DESIGN & SIDEBAR =====

# Left Sidebar (Stock List)
st.sidebar.markdown(f"""
<div style="text-align: center; margin-bottom: 15px;">
  <span style="font-family: 'Courier New', monospace; font-size: 0.72rem; color: #00ff87; background: rgba(0, 255, 135, 0.1); border: 1px solid #00ff87; padding: 2px 8px; border-radius: 4px;">LIVE TERMINAL RUNNING</span>
</div>
""", unsafe_allow_html=True)

# 1. Search Box
search_input = st.sidebar.text_input("🔍 Search shipping stocks...", "", placeholder="Type name or symbol...")

# 2. Sector Selector Tabs
categories = ["All", "Container", "Dry Bulk", "Tanker", "Gas Carrier", "Ports & Logistics", "Shipbuilding", "Offshore", "Marine Services", "Diversified", "Unlisted"]
selected_category = st.sidebar.selectbox("📂 Category / Sector Group", categories)

# 3. Filter stocks list
if selected_category == "Unlisted":
    filtered_list = [{"symbol": name, "name": name, "category": "Unlisted", "region": "Global"} for name in UNRESOLVED]
else:
    # Filter by Category
    if selected_category == "All":
        filtered_list = COMPANIES
    else:
        filtered_list = [c for c in COMPANIES if c['category'] == selected_category]
        
    # Filter by Search Text
    if search_input:
        term = search_input.lower()
        filtered_list = [c for c in filtered_list if term in c['name'].lower() or term in c['symbol'].lower()]

# 4. Sidebar Radio buttons list
if not filtered_list:
    st.sidebar.warning("No matching stocks found.")
    active_company = None
else:
    options_dict = {f"{c['symbol']} - {c['name']}": c for c in filtered_list}
    selected_option = st.sidebar.radio("📋 Active Watchlist", list(options_dict.keys()))
    active_company = options_dict[selected_option]


# ===== MAIN TERMINAL DISPLAY =====

# Logo Banner Header
st.markdown("""
<div style="display: flex; align-items: center; gap: 14px; margin-bottom: 25px; background: rgba(8, 12, 24, 0.6); padding: 12px 20px; border-radius: 6px; border-bottom: 2px solid #003a6c;">
  <div style="display: flex; align-items: stretch; height: 38px; border: 1.5px solid #003a6c; border-radius: 4px; overflow: hidden; background: #ffffff;">
    <div style="display: flex; flex-direction: column; justify-content: stretch; width: 140px; text-shadow: none;">
      <div style="background: #003a6c; color: #ffffff; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 0.65rem; letter-spacing: 1px; padding: 2px 6px; flex-grow: 1; text-transform: uppercase; line-height: 1.1;">
        Howe Robinson
      </div>
      <div style="background: #cf2027; color: #ffffff; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 0.6rem; letter-spacing: 3.5px; padding: 2px 6px; flex-grow: 1; text-transform: uppercase; border-top: 1px solid #ffffff; line-height: 1.1;">
        Partners
      </div>
    </div>
    <div style="background: #ffffff; width: 38px; display: flex; align-items: center; justify-content: center; border-left: 1.5px solid #003a6c; padding: 3px;">
      <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
        <path d="M 15,15 L 75,15 C 88,25 90,45 82,53 C 65,58 35,58 15,58 Z" fill="#003a6c" />
        <path d="M 15,58 C 35,58 65,58 82,53 L 81,56 C 65,61 35,61 15,61 Z" fill="#ffffff" />
        <path d="M 15,61 C 35,61 65,61 81,56 C 81,58 80,64 74,68 C 65,73 45,75 15,75 Z" fill="#cf2027" />
        <path d="M 74,68 C 80,68 88,72 88,76 C 88,80 80,82 72,82 C 60,82 15,80 15,80 Z" fill="#cf2027" />
      </svg>
    </div>
  </div>
  <h1 style="font-size: 1.25rem; font-weight: 700; color: #ffffff; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; padding: 0;">Stock Terminal</h1>
</div>
""", unsafe_allow_html=True)

if not active_company:
    st.info("Please select a company from the sidebar watch list to initialize visualization details.")
else:
    symbol = active_company['symbol']
    name = active_company['name']
    category = active_company['category']
    region = active_company['region']
    
    is_unlisted = category == "Unlisted"
    
    if is_unlisted:
        st.subheader(name)
        st.markdown(f"<span style='color:#ff4b4b;font-family:monospace;font-weight:bold;'>[UNLISTED COMPANY / PRIVATE ASSET]</span>", unsafe_allow_html=True)
        st.write("This company does not currently trade on public exchanges, or its ticker symbol is unresolved. Market rate calculations and historical charting are disabled for this asset.")
        st.write("You can still download consolidated reports for listed companies in related sectors from the export dropdown.")
    else:
        with st.spinner(f"Connecting to yfinance database for {symbol}..."):
            df, currency = fetch_stock_data(symbol)
            
        if df is None or df.empty:
            st.error(f"Could not load financial quotes for symbol {symbol}. Please verify Yahoo Finance connection.")
        else:
            close_prices = df['Close'].tolist()
            timestamps = [str(d)[:10] for d in df.index]
            
            price = close_prices[-1]
            prev_close = close_prices[-2] if len(close_prices) > 1 else price
            daily_change = price - prev_close
            daily_change_pct = (daily_change / prev_close) * 100
            
            wow_change = 0.0
            wow_change_pct = 0.0
            if len(close_prices) >= 6:
                wow_change = price - close_prices[-6]
                wow_change_pct = (wow_change / close_prices[-6]) * 100
                
            last_year_prices = close_prices[-252:] if len(close_prices) >= 252 else close_prices
            low_52 = min(last_year_prices)
            high_52 = max(last_year_prices)
            
            col_det1, col_det2 = st.columns([3, 1])
            with col_det1:
                st.markdown(f"### {name}")
                st.markdown(f"**Symbol**: `{symbol}`  |  **Sector**: `{category}`  |  **Region**: `{region}`  |  **Currency**: `{currency}`")
            with col_det2:
                color_class = "#00ff87" if daily_change >= 0 else "#ff4b4b"
                sign = "+" if daily_change >= 0 else ""
                st.markdown(f"<div style='text-align:right;'><span style='font-size:1.8rem;font-weight:bold;font-family:monospace;'>{price:.2f}</span> <span style='font-size:0.8rem;color:#9ca3af;'>{currency}</span></div>", unsafe_allow_html=True)
                st.markdown(f"<div style='text-align:right;color:{color_class};font-family:monospace;'>{sign}{daily_change:.2f} ({sign}{daily_change_pct:.2f}%)</div>", unsafe_allow_html=True)

            st.write("---")

            # Middle Section: Interactive Chart
            st.markdown("#### Performance Analytics")
            
            col_slider, col_spacer = st.columns([1, 4])
            with col_slider:
                chart_years = st.slider("Historical Range (Years)", min_value=1, max_value=20, value=5)
                
            cutoff_date = datetime.now() - timedelta(days=chart_years * 365)
            filtered_df = df[df.index >= cutoff_date]
            if filtered_df.empty:
                filtered_df = df.tail(chart_years * 252)
                
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=filtered_df.index, 
                y=filtered_df['Close'], 
                mode='lines', 
                line=dict(color='#0082f0', width=2),
                name='Daily Close',
                hoverinfo='x+y',
                hovertemplate='Date: %{x|%Y-%m-%d}<br>Price: %{y:.2f} ' + currency
            ))
            
            fig.add_trace(go.Scatter(
                x=[filtered_df.index[-1]], 
                y=[filtered_df['Close'].iloc[-1]], 
                mode='markers', 
                marker=dict(color='#00ff87', size=9, line=dict(color='#ffffff', width=2)),
                name="Today's Price"
            ))
            
            fig.update_layout(
                plot_bgcolor='rgba(13, 20, 38, 0.4)',
                paper_bgcolor='rgba(6, 9, 19, 0.4)',
                font=dict(color='#9ca3af', family='Inter, sans-serif'),
                xaxis=dict(
                    showgrid=True, gridcolor='rgba(255,255,255,0.02)',
                    tickformat="%b '%y",
                    tickmode='auto',
                    nticks=18
                ),
                yaxis=dict(showgrid=True, gridcolor='rgba(255,255,255,0.04)'),
                margin=dict(l=40, r=40, t=10, b=40),
                showlegend=False,
                height=380
            )
            st.plotly_chart(fig, use_container_width=True)

            # Bottom Section: Three Columns (Rate Analysis, News Feed, Exports)
            st.write("---")
            col_b1, col_b2, col_b3 = st.columns([1, 1, 1])
            
            with col_b1:
                st.markdown("#### Daily Rate Analysis")
                sign = "+" if daily_change >= 0 else ""
                w_sign = "+" if wow_change >= 0 else ""
                st.markdown(f"""
                <div class="metric-card">
                    <div style="display:flex;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;margin-bottom:8px;">
                        <span style="flex-grow:1;">Today's Active Rate:</span>
                        <strong style="color:#0082f0;font-family:monospace;">{price:.2f} {currency}</strong>
                    </div>
                    <div style="display:flex;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;margin-bottom:8px;">
                        <span style="flex-grow:1;">Yesterday's Close Rate:</span>
                        <strong style="font-family:monospace;color:#f3f4f6;">{prev_close:.2f} {currency}</strong>
                    </div>
                    <div style="display:flex;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;margin-bottom:8px;">
                        <span style="flex-grow:1;">Daily Rate Change:</span>
                        <strong style="font-family:monospace;color:{'#00ff87' if daily_change >= 0 else '#ff4b4b'};">{sign}{daily_change:.2f} ({sign}{daily_change_pct:.2f}%)</strong>
                    </div>
                    <div style="display:flex;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;margin-bottom:8px;">
                        <span style="flex-grow:1;">Weekly Change (WoW):</span>
                        <strong style="font-family:monospace;color:{'#00ff87' if wow_change >= 0 else '#ff4b4b'};">{w_sign}{wow_change:.2f} ({w_sign}{wow_change_pct:.2f}%)</strong>
                    </div>
                    <div style="display:flex;justify-content:between;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;margin-bottom:8px;">
                        <span style="flex-grow:1;">52-Week High:</span>
                        <strong style="color:#00ff87;font-family:monospace;">{high_52:.2f} {currency}</strong>
                    </div>
                    <div style="display:flex;justify-content:between;padding-bottom:4px;">
                        <span style="flex-grow:1;">52-Week Low:</span>
                        <strong style="color:#ff4b4b;font-family:monospace;">{low_52:.2f} {currency}</strong>
                    </div>
                </div>
                """, unsafe_allow_html=True)
                
            with col_b2:
                st.markdown("#### Latest News")
                news = fetch_news(name)
                if not news:
                    st.markdown("<div style='color:#9ca3af;font-size:0.85rem;text-align:center;padding-top:20px;'>No recent news headlines found</div>", unsafe_allow_html=True)
                else:
                    for item in news[:5]:
                        st.markdown(f"""
                        <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 6px;">
                            <a href="{item['link']}" target="_blank" style="color:#0082f0;font-size:0.82rem;font-weight:bold;text-decoration:none;">{item['title']}</a>
                            <div style="font-size:0.72rem;color:#9ca3af;margin-top:2px;">{item.get('source', 'Google News')}</div>
                        </div>
                        """, unsafe_allow_html=True)
                        
            with col_b3:
                st.markdown("#### Export & Download")
                
                # Single Company Export
                st.markdown("**Single Company Report**")
                st.markdown("<span style='color:#9ca3af;font-size:0.75rem;'>Download financial details for active Watchlist company as a branded PDF.</span>", unsafe_allow_html=True)
                
                rates_dict = {
                    'price': price,
                    'prev_close': prev_close,
                    'daily_change': daily_change,
                    'daily_change_pct': daily_change_pct,
                    'wow_change': wow_change,
                    'wow_change_pct': wow_change_pct,
                    'high_52': high_52,
                    'low_52': low_52
                }
                
                # Lock graph range to exactly 5 years for PDF export
                cutoff_5y = datetime.now() - timedelta(days=5 * 365)
                df_5y = df[df.index >= cutoff_5y]
                if df_5y.empty:
                    df_5y = df.tail(5 * 252)
                prices_5y = df_5y['Close'].tolist()
                
                pdf_data_single = generate_single_company_pdf(name, symbol, category, region, currency, rates_dict, prices_5y, news)
                st.download_button(
                    label="Download PDF Report",
                    data=pdf_data_single,
                    file_name=f"{symbol}_financial_report.pdf",
                    mime="application/pdf",
                    key="btn_pdf_single"
                )
                
                st.markdown("<div style='border-top:1px solid rgba(255,255,255,0.05);margin:12px 0;'></div>", unsafe_allow_html=True)
                
                # Consolidated Export
                st.markdown("**Consolidated Master Report**")
                st.markdown("<span style='color:#9ca3af;font-size:0.75rem;'>Compare multiple fleets sector-wise or compile all 274 companies into a single PDF table.</span>", unsafe_allow_html=True)
                
                cat_choices = ["All Companies (Consolidated)"] + [c for c in categories if c not in ["All", "Unlisted"]]
                selected_export_cat = st.selectbox("Select Export Category", cat_choices)
                
                if selected_export_cat == "All Companies (Consolidated)":
                    matched_list = COMPANIES
                    filename = "All_Companies_consolidated_report.pdf"
                    title = "All Sectors"
                else:
                    matched_list = [c for c in COMPANIES if c['category'] == selected_export_cat]
                    filename = f"{selected_export_cat.replace(' ', '_')}_consolidated_report.pdf"
                    title = selected_export_cat
                    
                pdf_data_consolidated = generate_consolidated_pdf(title, matched_list)
                st.download_button(
                    label="Download Consolidated PDF",
                    data=pdf_data_consolidated,
                    file_name=filename,
                    mime="application/pdf",
                    key="btn_pdf_consolidated"
                )
