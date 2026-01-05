from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from app.database import Base

class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    content = Column(Text, nullable=False)
    excerpt = Column(Text)
    meta_description = Column(String(160))
    featured_image = Column(String(500))
    published = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    author_name = Column(String(100), default="ResumeAI Team")
    category = Column(String(50), index=True)
    tags = Column(String(255))
    read_time_minutes = Column(Integer, default=5)
