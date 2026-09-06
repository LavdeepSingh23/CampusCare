def display_name_from_email(email: str) -> str:
    """
    NOTE: there is no name column anywhere in the schema for staff/doctors
    (USER_ACCOUNT has only email, STAFF has no name field). This falls back
    to a title-cased version of the email's local part as a placeholder.
    Recommend adding a `full_name` column to STAFF so real names can be
    shown instead.
    """
    local_part = email.split("@", 1)[0]
    return local_part.replace(".", " ").replace("_", " ").title()
