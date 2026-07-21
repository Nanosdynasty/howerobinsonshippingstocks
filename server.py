import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import os
import time
from datetime import datetime

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

COMPANIES = [
    {"symbol": "ZIM", "name": "ZIM Integrated Shipping Services", "category": "Container", "region": "US/Global"},
    {"symbol": "AMKBY", "name": "A.P. Møller - Mærsk A/S (ADR)", "category": "Container", "region": "Europe/Global"},
    {"symbol": "HLAG.DE", "name": "Hapag-Lloyd AG", "category": "Container", "region": "Europe"},
    {"symbol": "1919.HK", "name": "COSCO Shipping Holdings", "category": "Container", "region": "Asia"},
    {"symbol": "2603.TW", "name": "Evergreen Marine Corp.", "category": "Container", "region": "Asia"},
    {"symbol": "FRO", "name": "Frontline plc", "category": "Tanker", "region": "Global"},
    {"symbol": "SBLK", "name": "Star Bulk Carriers Corp.", "category": "Dry Bulk", "region": "Global"},
    {"symbol": "GOGL", "name": "Golden Ocean Group Ltd.", "category": "Dry Bulk", "region": "Global"},
    {"symbol": "9104.T", "name": "Mitsui O.S.K. Lines, Ltd.", "category": "Diversified", "region": "Asia"},
    {"symbol": "ADANIPORTS.NS", "name": "Adani Ports & SEZ", "category": "Ports & Logistics", "region": "India"},
    {"symbol": "SCI.NS", "name": "Shipping Corp of India", "category": "Diversified", "region": "India"},
    {"symbol": "GESHIP.NS", "name": "Great Eastern Shipping Co.", "category": "Diversified", "region": "India"}
]

# Simple in-memory cache to prevent rate-limiting and speed up loads
cache = {
    "stocks": None,
    "last_updated": 0
}
CACHE_DURATION = 300 # 5 minutes

def fetch_from_yahoo(url):
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching from Yahoo: {e}")
        return None

def get_stock_data():
    global cache
    now = time.time()
    if cache["stocks"] and (now - cache["last_updated"] < CACHE_DURATION):
        return cache["stocks"]

    print("Fetching fresh stock metrics from Yahoo Finance...")
    updated_stocks = []
    
    for comp in COMPANIES:
        symbol = comp["symbol"]
        # Fetch 1 month of daily data to get current price, yesterday's price, and price 5 trading days ago
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1mo&interval=1d"
        data = fetch_from_yahoo(url)
        
        if not data or "chart" not in data or not data["chart"]["result"]:
            print(f"Failed to fetch data for {symbol}")
            continue
            
        result = data["chart"]["result"][0]
        meta = result.get("meta", {})
        
        close_prices = []
        quote = result.get("indicators", {}).get("quote", [{}])[0]
        if "close" in quote:
            close_prices = [p for p in quote["close"] if p is not None]
            
        if not close_prices:
            print(f"No valid close prices for {symbol}")
            continue
            
        current_price = meta.get("regularMarketPrice") or close_prices[-1]
        
        prev_close = meta.get("chartPreviousClose")
        if not prev_close and len(close_prices) > 1:
            prev_close = close_prices[-2]
        elif not prev_close:
            prev_close = current_price
            
        daily_change = current_price - prev_close
        daily_change_pct = (daily_change / prev_close) * 100 if prev_close else 0.0
        
        wow_change = 0.0
        wow_change_pct = 0.0
        if len(close_prices) >= 6:
            price_5_days_ago = close_prices[-6]
            wow_change = current_price - price_5_days_ago
            wow_change_pct = (wow_change / price_5_days_ago) * 100
        elif len(close_prices) > 1:
            price_oldest = close_prices[0]
            wow_change = current_price - price_oldest
            wow_change_pct = (wow_change / price_oldest) * 100
            
        currency = meta.get("currency", "USD")
        
        updated_stocks.append({
            "symbol": symbol,
            "name": comp["name"],
            "category": comp["category"],
            "region": comp["region"],
            "price": round(current_price, 2),
            "prev_close": round(prev_close, 2),
            "daily_change": round(daily_change, 2),
            "daily_change_pct": round(daily_change_pct, 2),
            "wow_change": round(wow_change, 2),
            "wow_change_pct": round(wow_change_pct, 2),
            "currency": currency,
            "sparkline": [round(p, 2) for p in close_prices[-7:]]
        })
        time.sleep(0.1)
        
    if updated_stocks:
        cache["stocks"] = updated_stocks
        cache["last_updated"] = now
        return updated_stocks
    else:
        return cache["stocks"] or []

class StockTerminalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)
        
        if path == "/api/stocks":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            stocks_data = get_stock_data()
            self.wfile.write(json.dumps(stocks_data).encode('utf-8'))
            
        elif path == "/api/history":
            symbol = query_params.get("symbol", [None])[0]
            if not symbol:
                self.send_error(400, "Missing symbol parameter")
                return
                
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=20y&interval=1mo"
            data = fetch_from_yahoo(url)
            
            history_response = {"timestamps": [], "prices": []}
            if not data or "chart" not in data or not data.get("chart", {}).get("result"):
                self.wfile.write(json.dumps(history_response).encode('utf-8'))
                return
                
            result = data["chart"]["result"][0]
            timestamps = result.get("timestamp", [])
            quote = result.get("indicators", {}).get("quote", [{}])[0]
            close_prices = quote.get("close", [])
            
            clean_timestamps = []
            clean_prices = []
            for t, p in zip(timestamps, close_prices):
                if p is not None:
                    dt = datetime.fromtimestamp(t)
                    clean_timestamps.append(dt.strftime("%Y-%m"))
                    clean_prices.append(round(p, 2))
                    
            history_response["timestamps"] = clean_timestamps
            history_response["prices"] = clean_prices
            
            self.wfile.write(json.dumps(history_response).encode('utf-8'))
            
        else:
            super().do_GET()

if __name__ == "__main__":
    os.makedirs(DIRECTORY, exist_ok=True)
    # Warm up cache in background/start
    try:
        get_stock_data()
    except Exception as e:
        print(f"Warning: Failed to pre-fetch cache: {e}")
        
    print(f"Starting Maritime Stock Terminal server at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), StockTerminalHandler) as httpd:
        httpd.serve_forever()
