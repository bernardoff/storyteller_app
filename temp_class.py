class CombatEncounter(Base):
    __tablename__ = 'combat_encounters'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey('campaigns.id'))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey('session_logs.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(default=True)
    current_turn_index: Mapped[int] = mapped_column(default=0)
    round_number: Mapped[int] = mapped_column(default=1)
    combatants_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    combat_log_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phase: Mapped[str] = mapped_column(String(20), default='initiative')
    initiative_roster_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_actions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage_suggestions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())