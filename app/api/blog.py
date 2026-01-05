from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json

from app.database import get_db
from app.models.blog import BlogPost
from app.models.like import BlogLike
from app.dependencies import get_verified_email

router = APIRouter(prefix="/api/blog", tags=["blog"])

def serialize_blog_post(post):
    """Convert BlogPost ORM object to dict for JSON serialization"""
    return {
        "id": post.id,
        "title": post.title,
        "slug": post.slug,
        "content": post.content,
        "excerpt": post.excerpt,
        "meta_description": post.meta_description,
        "featured_image": post.featured_image,
        "published": post.published,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
        "author_name": post.author_name,
        "category": post.category,
        "tags": post.tags,
        "read_time_minutes": post.read_time_minutes
    }

class BlogPostResponse(BaseModel):
    id: int
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    meta_description: Optional[str] = None
    featured_image: Optional[str] = None
    published: bool
    created_at: str
    updated_at: Optional[str] = None
    author_name: str
    category: Optional[str] = None
    tags: Optional[str] = None
    read_time_minutes: int

    class Config:
        from_attributes = True

class BlogPostCreate(BaseModel):
    title: str
    content: str
    excerpt: Optional[str] = None
    meta_description: Optional[str] = None
    featured_image: Optional[str] = None
    published: bool = True
    author_name: str = "ResumeAI Team"
    category: Optional[str] = None
    tags: Optional[str] = None
    read_time_minutes: int = 5

@router.post("/posts", response_model=BlogPostResponse)
def create_blog_post(
    post: BlogPostCreate,
    email: str = Depends(get_verified_email),
    db: Session = Depends(get_db)
):
    """Create a new blog post - only accessible to dxdelvin@gmail.com"""
    # Only allow dxdelvin@gmail.com to create blog posts
    if email != "dxdelvin@gmail.com":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if slug already exists
    existing_post = db.query(BlogPost).filter(BlogPost.slug == post.slug).first()
    if existing_post:
        raise HTTPException(status_code=400, detail="A post with this slug already exists")
    
    # Create new blog post
    new_post = BlogPost(**post.dict())
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    
    return serialize_blog_post(new_post)

@router.get("/posts", response_model=List[BlogPostResponse])
def get_blog_posts(
    published_only: bool = True,
    category: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get blog posts with optional filtering"""
    try:
        query = db.query(BlogPost)
        
        if published_only:
            query = query.filter(BlogPost.published == True)
        
        if category:
            query = query.filter(BlogPost.category == category)
        
        posts = query.order_by(BlogPost.created_at.desc()).offset(offset).limit(limit).all()
        
        return [serialize_blog_post(post) for post in posts]
    except Exception as e:
        print(f"Error in get_blog_posts: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/posts/{slug}", response_model=BlogPostResponse)
def get_blog_post(slug: str, db: Session = Depends(get_db)):
    """Get a single blog post by slug"""
    try:
        post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
        
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        return serialize_blog_post(post)
    except Exception as e:
        print(f"Error in get_blog_post: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Get all unique categories"""
    try:
        categories = db.query(BlogPost.category).filter(
            BlogPost.category.isnot(None),
            BlogPost.published == True
        ).distinct().all()
        
        return {"categories": [cat[0] for cat in categories if cat[0]]}
    except Exception as e:
        print(f"Error in get_categories: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/featured", response_model=List[BlogPostResponse])
def get_featured_posts(limit: int = 3, db: Session = Depends(get_db)):
    """Get featured blog posts"""
    try:
        posts = db.query(BlogPost).filter(
            BlogPost.published == True,
            BlogPost.featured_image.isnot(None)
        ).order_by(BlogPost.created_at.desc()).limit(limit).all()
        
        return [serialize_blog_post(post) for post in posts]
    except Exception as e:
        print(f"Error in get_featured_posts: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
# --- Like Endpoints ---

class LikeRequest(BaseModel):
    user_email: str

@router.post("/posts/{post_id}/like")
def toggle_like_post(
    post_id: int,
    request: LikeRequest,
    db: Session = Depends(get_db)
):
    """Toggle like status for a blog post"""
    try:
        user_email = request.user_email
        if not user_email:
            raise HTTPException(status_code=400, detail="user_email is required")
        
        # Verify post exists
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Check if like already exists
        existing_like = db.query(BlogLike).filter(
            BlogLike.post_id == post_id,
            BlogLike.user_email == user_email
        ).first()
        
        if existing_like:
            # Unlike: remove the like
            db.delete(existing_like)
            db.commit()
            liked = False
        else:
            # Like: add new like
            new_like = BlogLike(post_id=post_id, user_email=user_email)
            db.add(new_like)
            db.commit()
            liked = True
        
        # Get total likes
        total_likes = db.query(BlogLike).filter(BlogLike.post_id == post_id).count()
        
        return {
            "liked": liked,
            "total_likes": total_likes
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error toggling like: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle like")

@router.get("/posts/{post_id}/likes")
def get_post_likes(
    post_id: int,
    db: Session = Depends(get_db)
):
    """Get like information for a blog post"""
    try:
        # Verify post exists
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Get total likes
        total_likes = db.query(BlogLike).filter(BlogLike.post_id == post_id).count()
        
        return {
            "post_id": post_id,
            "total_likes": total_likes,
            "user_liked": False  # Default false when no user_email provided
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting likes: {e}")
        raise HTTPException(status_code=500, detail="Failed to get likes")

@router.get("/posts/{post_id}/user-like/{user_email}")
def check_user_like(
    post_id: int,
    user_email: str,
    db: Session = Depends(get_db)
):
    """Check if a specific user has liked a blog post"""
    try:
        # Verify post exists
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Check if user has liked the post
        like = db.query(BlogLike).filter(
            BlogLike.post_id == post_id,
            BlogLike.user_email == user_email
        ).first()
        
        return {
            "post_id": post_id,
            "user_email": user_email,
            "user_liked": like is not None
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking user like: {e}")
        raise HTTPException(status_code=500, detail="Failed to check like status")