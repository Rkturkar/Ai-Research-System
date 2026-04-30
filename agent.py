from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from tool import web_search, scrape_url
from dotenv import load_dotenv
import os
import random
load_dotenv()

# ✅ FIX: correct env key

GROQ_KEYS = [
    os.getenv("GROQ_API_KEY_1"),
    os.getenv("GROQ_API_KEY_2"),
    os.getenv("GROQ_API_KEY_3"),
]

def get_llm():
    key = random.choice(GROQ_KEYS)

    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=key,
        temperature=0
    )

llm = get_llm()


def build_search_agent():
    return create_agent(
        model=llm,
        tools=[web_search]
    )

def build_reader_agent():
    return create_agent(
        model=llm,
        tools=[scrape_url]
    )

# Writer
writer_chain = ChatPromptTemplate.from_messages([
    ("system", "You are an expert research writer."),
    ("human", """Write a detailed research report.

Topic: {topic}

Research:
{research}

Structure:
- Introduction
- Key Findings
- Conclusion
- Sources"""),
]) | llm | StrOutputParser()

# Critic
critic_chain = ChatPromptTemplate.from_messages([
    ("system", "You are a strict research critic."),
    ("human", """Review the report:

{report}

Format:

Score: X/10

Strengths:
- ...

Areas to Improve:
- ...

One line verdict:
..."""),
]) | llm | StrOutputParser()