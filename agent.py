from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from tool import web_search, scrape_url
from dotenv import load_dotenv
import os

load_dotenv()

# ✅ FIX: correct env key
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY_2")
)

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