from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.comment import Comment
from app.models.blog import BlogPost
from app.models.comment_like import CommentLike
from app.dependencies import get_verified_email

router = APIRouter(prefix="/api/blog/comments", tags=["comments"])

class CommentCreate(BaseModel):
    author_name: str
    author_email: str
    content: str
    post_id: int

class CommentResponse(BaseModel):
    id: int
    post_id: int
    author_name: str
    author_email: str
    content: str
    approved: bool
    created_at: str
    
    class Config:
        from_attributes = True

@router.post("/", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    comment: CommentCreate,
    db: Session = Depends(get_db)
):
    """Create a new comment on a blog post"""
    try:
        # Verify post exists
        post = db.query(BlogPost).filter(BlogPost.id == comment.post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Validate input
        if not comment.author_name or len(comment.author_name.strip()) == 0:
            raise HTTPException(status_code=400, detail="Author name is required")
        
        if not comment.author_email or len(comment.author_email.strip()) == 0:
            raise HTTPException(status_code=400, detail="Author email is required")
        
        if not comment.content or len(comment.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="Comment content is required")
        
        if len(comment.content) > 5000:
            raise HTTPException(status_code=400, detail="Comment is too long (max 5000 characters)")
        
        # Create new comment (not approved by default)
        new_comment = Comment(
            post_id=comment.post_id,
            author_name=comment.author_name.strip(),
            author_email=comment.author_email.strip(),
            content=comment.content.strip(),
            approved=False
        )
        
        db.add(new_comment)
        db.commit()
        db.refresh(new_comment)
        
        return CommentResponse(
            id=new_comment.id,
            post_id=new_comment.post_id,
            author_name=new_comment.author_name,
            author_email=new_comment.author_email,
            content=new_comment.content,
            approved=new_comment.approved,
            created_at=new_comment.created_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating comment: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create comment")

@router.get("/post/{post_id}", response_model=List[CommentResponse])
def get_post_comments(
    post_id: int,
    db: Session = Depends(get_db)
):
    """Get all comments for a blog post"""
    try:
        # Verify post exists
        post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Get all comments regardless of approval status
        comments = db.query(Comment).filter(
            Comment.post_id == post_id
        ).order_by(Comment.created_at.desc()).all()
        
        return [
            CommentResponse(
                id=c.id,
                post_id=c.post_id,
                author_name=c.author_name,
                author_email=c.author_email,
                content=c.content,
                approved=c.approved,
                created_at=c.created_at.isoformat()
            )
            for c in comments
        ]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching comments: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch comments")

@router.get("/admin/pending", response_model=List[dict])
def get_pending_comments(
    email: str = Depends(get_verified_email),
    db: Session = Depends(get_db)
):
    """Get all pending comments - admin only"""
    try:
        # Only allow admin
        if email != "dxdelvin@gmail.com":
            raise HTTPException(status_code=403, detail="Access denied")
        
        comments = db.query(Comment).filter(
            Comment.approved == False
        ).order_by(Comment.created_at.asc()).all()
        
        return [
            {
                "id": c.id,
                "post_id": c.post_id,
                "author_name": c.author_name,
                "author_email": c.author_email,
                "content": c.content,
                "created_at": c.created_at.isoformat()
            }
            for c in comments
        ]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching pending comments: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch pending comments")

@router.put("/{comment_id}/approve")
def approve_comment(
    comment_id: int,
    email: str = Depends(get_verified_email),
    db: Session = Depends(get_db)
):
    """Approve a comment - admin only"""
    try:
        # Only allow admin
        if email != "dxdelvin@gmail.com":
            raise HTTPException(status_code=403, detail="Access denied")
        
        comment = db.query(Comment).filter(Comment.id == comment_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        comment.approved = True
        db.commit()
        db.refresh(comment)
        
        return {"message": "Comment approved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error approving comment: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to approve comment")

@router.delete("/{comment_id}")
def delete_comment(
    comment_id: int,
    email: str = Depends(get_verified_email),
    db: Session = Depends(get_db)
):
    """Delete a comment - admin only"""
    try:
        # Only allow admin
        if email != "dxdelvin@gmail.com":
            raise HTTPException(status_code=403, detail="Access denied")
        
        comment = db.query(Comment).filter(Comment.id == comment_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        db.delete(comment)
        db.commit()
        
        return {"message": "Comment deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting comment: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete comment")
# --- Comment Like Endpoints ---

class CommentLikeRequest(BaseModel):
    user_email: str

@router.post("/{comment_id}/like")
def toggle_comment_like(
    comment_id: int,
    request: CommentLikeRequest,
    db: Session = Depends(get_db)
):
    """Toggle like status for a comment"""
    try:
        user_email = request.user_email
        if not user_email:
            raise HTTPException(status_code=400, detail="user_email is required")
        
        # Verify comment exists
        comment = db.query(Comment).filter(Comment.id == comment_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        # Check if like already exists
        existing_like = db.query(CommentLike).filter(
            CommentLike.comment_id == comment_id,
            CommentLike.user_email == user_email
        ).first()
        
        if existing_like:
            # Unlike: remove the like
            db.delete(existing_like)
            db.commit()
            liked = False
        else:
            # Like: add new like
            new_like = CommentLike(comment_id=comment_id, user_email=user_email)
            db.add(new_like)
            db.commit()
            liked = True
        
        # Get total likes
        total_likes = db.query(CommentLike).filter(CommentLike.comment_id == comment_id).count()
        
        return {
            "liked": liked,
            "total_likes": total_likes
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error toggling comment like: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle like")

@router.get("/{comment_id}/likes")
def get_comment_likes(
    comment_id: int,
    db: Session = Depends(get_db)
):
    """Get like information for a comment"""
    try:
        # Verify comment exists
        comment = db.query(Comment).filter(Comment.id == comment_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        # Get total likes
        total_likes = db.query(CommentLike).filter(CommentLike.comment_id == comment_id).count()
        
        return {
            "comment_id": comment_id,
            "total_likes": total_likes,
            "user_liked": False
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting comment likes: {e}")
        raise HTTPException(status_code=500, detail="Failed to get likes")