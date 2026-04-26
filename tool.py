from langchain.tools import tool
import requests
from bs4 import BeautifulSoup
from tavily import TavilyClient
import os
from dotenv import load_dotenv

load_dotenv()

tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY_1"))


@tool
def web_search(query: str) -> str:
    """Search the web for recent and reliable information on a topic."""
    results = tavily.search(query=query, max_results=5)
    out = []
    for r in results['results']:
        out.append(
            f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content'][:300]}\n"
        )
    return "\n----\n".join(out)


@tool
def scrape_url(url: str) -> str:
    """Scrape and return clean text content from a given URL."""
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        return soup.get_text(separator=" ", strip=True)[:3000]
    except Exception as e:
        return f"Could not scrape URL: {str(e)}"


def search_images(query: str, num: int = 6) -> list:
    """Search images using Serper API. Tries all common .env key names."""

    # Try every common key name
    api_key = (
        os.getenv("SERP_API_KEY") or
        os.getenv("SERPER_API_KEY") or
        os.getenv("SERP_API_KEY_1") or
        os.getenv("SERPER_API_KEY_1") or
        os.getenv("SERPER_KEY") or
        os.getenv("SERP_KEY")
    )

    if not api_key:
        print("NO SERPER KEY FOUND - check your .env file")
        return []

    print(f"Serper key found: {api_key[:8]}...")

    try:
        response = requests.post(
            "https://google.serper.dev/images",
            headers={
                "X-API-KEY": api_key,
                "Content-Type": "application/json"
            },
            json={"q": query, "num": num},
            timeout=10
        )

        print(f"Serper HTTP status: {response.status_code}")

        if response.status_code != 200:
            print(f"Serper error body: {response.text[:300]}")
            return []

        data = response.json()
        raw = data.get("images", [])
        print(f"Images received from Serper: {len(raw)}")

        images = []
        for item in raw[:num]:
            img_url   = item.get("imageUrl", "")
            thumb_url = item.get("thumbnailUrl", "") or img_url
            if not img_url:
                continue
            images.append({
                "title":        item.get("title", ""),
                "imageUrl":     img_url,
                "thumbnailUrl": thumb_url,
                "source":       item.get("source", ""),
                "link":         item.get("link", "") or img_url,
            })

        print(f"Final valid images: {len(images)}")
        return images

    except Exception as e:
        print(f"search_images error: {e}")
        return []