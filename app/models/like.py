from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base

class BlogLike(Base):
    __tablename__ = "blog_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("blog_posts.id"), nullable=False)
    user_email = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Ensure each user can only like a post once
    __table_args__ = (UniqueConstraint('post_id', 'user_email', name='uq_post_user_like'),)
